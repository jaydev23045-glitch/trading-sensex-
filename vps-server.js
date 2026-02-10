import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

// 1. GLOBAL ERROR HANDLERS
process.on('uncaughtException', (err) => { 
    console.error('CRITICAL ERROR (Uncaught):', err); 
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 5000;
const WS_PORT = 8080;
const TOKEN_FILE = 'session_token.json';

// ⚠️KEYS ARE MANAGED BY CONFIGURE.JS NOW⚠️
const FLATTRADE_CONFIG = {
    api_key: "ENTER_YOUR_API_KEY_HERE",
    api_secret: "ENTER_YOUR_API_SECRET_HERE",
    user_id: "ENTER_YOUR_USER_ID_HERE", 
    redirect_url: "ENTER_YOUR_REDIRECT_URL_HERE" 
};

app.use(cors({ origin: '*' }));
app.use(express.json());

// REQUEST LOGGER
app.use((req, res, next) => {
    if (req.url !== '/ping') { 
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    }
    next();
});

let flattradeToken = null;
let marketSocket = null;

// --- 💾 SESSION PERSISTENCE (ONE-TIME LOGIN) ---
function saveSession(token) {
    try {
        const data = JSON.stringify({ 
            token: token, 
            date: new Date().toDateString() // Expires automatically next day
        });
        fs.writeFileSync(TOKEN_FILE, data);
        console.log("💾 Session Saved. Auto-Login enabled for today.");
    } catch (e) {
        console.error("Failed to save session:", e);
    }
}

async function restoreSession() {
    if (!fs.existsSync(TOKEN_FILE)) return;

    try {
        const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
        const data = JSON.parse(raw);
        
        // Check if token is from today
        if (data.date !== new Date().toDateString()) {
            console.log("⚠️ Session expired (Yesterday). Please login again.");
            fs.unlinkSync(TOKEN_FILE);
            return;
        }

        console.log("🔄 Restoring previous session...");
        
        // Validate Token with Broker
        if (FLATTRADE_CONFIG.user_id.includes("ENTER_YOUR")) return;
        
        const userId = FLATTRADE_CONFIG.user_id.trim();
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', 
            { uid: userId, actid: userId }, 
            { headers: { Authorization: `Bearer ${data.token}` } } 
        );

        if (response.data.stat === "Ok") {
            flattradeToken = data.token;
            console.log("✅ SESSION RESTORED! System Online.");
            startWebSocket(flattradeToken);
        } else {
            console.log("❌ Saved token is invalid. Please login again.");
            fs.unlinkSync(TOKEN_FILE);
        }
    } catch (e) {
        console.error("❌ Session restore failed:", e.message);
    }
}

app.get('/', (req, res) => { res.send("VPS Server is Running! Status: " + (flattradeToken ? "Logged In" : "Waiting for Login")); });

// Health Check
app.get('/ping', (req, res) => res.send('pong'));

// Auth Check
app.get('/check-auth', (req, res) => {
    res.json({ isLoggedIn: !!flattradeToken });
});

app.get('/login', (req, res) => { 
    if (FLATTRADE_CONFIG.api_key.includes("ENTER_YOUR")) {
        return res.status(500).json({ 
            error: "CONFIGURATION_ERROR", 
            message: "API Keys are missing. Please run 'node configure.js' in terminal." 
        });
    }
    
    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const loginUrl = `https://auth.flattrade.in/?app_key=${cleanKey}`; 
    console.log("Serving Login URL:", loginUrl);
    res.json({ url: loginUrl }); 
});

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    
    if (!code) {
        return res.status(400).json({ error: "No Code Received", message: "The login code was missing." });
    }

    if (FLATTRADE_CONFIG.api_key.includes("ENTER_YOUR")) {
         return res.status(400).json({ 
            error: "KEYS_MISSING", 
            details: { emsg: "API Keys are missing. Run 'node configure.js' in VPS terminal." } 
        });
    }

    // 🛡️ SECURITY: Strict Trim
    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const cleanSecret = FLATTRADE_CONFIG.api_secret.trim();
    
    console.log(`\n🔑 ATTEMPTING LOGIN...`);
    
    // DEBUGGING INVALID KEYS
    if (cleanSecret.length > 40) {
        console.error(`❌ FATAL ERROR: API SECRET IS TOO LONG (${cleanSecret.length} chars)`);
        console.error("   It should be 32 chars. You likely pasted the wrong thing.");
        return res.status(500).json({
            error: "CONFIGURATION_ERROR",
            details: {
                message: "Your API Secret is invalid (Too Long).",
                tip: "Please run 'node configure.js' to fix this.",
                debug_info: `Secret Len: ${cleanSecret.length} (Expected: 32)`
            }
        });
    }

    try {
        const rawString = cleanKey + code + cleanSecret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { 
            api_key: cleanKey, 
            request_code: code, 
            api_secret: apiSecretHash 
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        // 1. Explicit Broker Rejection
        if (response.data.stat === "Not_Ok") {
            console.error("❌ Broker Rejected:", response.data.emsg);
            return res.status(400).json({ 
                error: response.data.emsg, 
                details: response.data 
            });
        }

        // 2. Success Case
        if (response.data.token) {
            flattradeToken = response.data.token;
            console.log("✅ Login Successful. Token obtained.");
            
            // SAVE SESSION TO DISK
            saveSession(flattradeToken);

            startWebSocket(flattradeToken);
            res.json({ success: true, token: flattradeToken });
        } else { 
            // 3. Hash Mismatch Case
            console.error("❌ TOKEN MISSING. Broker Response:", JSON.stringify(response.data));
            res.status(500).json({ 
                error: "Invalid Secret or Hash Mismatch", 
                details: {
                    message: "Broker accepted the request but did not return a token.",
                    tip: "Run 'node configure.js' to reset your keys.",
                    debug_info: `Key Len: ${cleanKey.length}, Secret Len: ${cleanSecret.length}`
                }
            });
        }
    } catch (error) { 
        console.error("❌ Auth Error:", error.response?.data || error.message);
        res.status(401).json({ error: 'Auth failed', details: error.message }); 
    }
});

app.get('/funds', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'Not Logged In' });
    try {
        const userId = FLATTRADE_CONFIG.user_id.trim();
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', 
            { uid: userId, actid: userId }, 
            { headers: { Authorization: `Bearer ${flattradeToken}` } }
        );
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/place-order', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'Not Logged In.' });
    try {
        const orderData = req.body;
        const userId = FLATTRADE_CONFIG.user_id.trim();
        console.log(`⚡ ORDER: ${orderData.side} ${orderData.symbol}`);
        
        const payload = { ...orderData, uid: userId, actid: userId };
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/PlaceOrder', payload, { 
            headers: { Authorization: `Bearer ${flattradeToken}` } 
        });
        
        if (response.data.stat === "Not_Ok") {
            return res.status(400).json({ error: response.data.emsg, details: response.data });
        }
        res.json(response.data);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });

function startWebSocket(token) {
    if (marketSocket) { try { marketSocket.terminate(); } catch(e) {} }
    marketSocket = new WebSocket('wss://piconnect.flattrade.in/PiConnectTP/websocket');
    marketSocket.on('open', () => {
        console.log('✅ Connected to Flattrade Market Data');
        const userId = FLATTRADE_CONFIG.user_id.trim();
        const connectReq = { t: "c", uid: userId, actid: userId, source: "API" };
        marketSocket.send(JSON.stringify(connectReq));
        setTimeout(() => { 
            const subscribeReq = { t: "t", k: "NFO|56000,NFO|56001,NFO|56002" }; 
            marketSocket.send(JSON.stringify(subscribeReq)); 
        }, 1000);
    });
    marketSocket.on('message', (data) => { 
        wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(data.toString()); }); 
    });
    marketSocket.on('close', () => { setTimeout(() => { if(flattradeToken) startWebSocket(flattradeToken); }, 5000); });
}

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ VPS Server running on Port ${PORT}`);
    
    // CONFIG CHECK ON STARTUP
    const key = FLATTRADE_CONFIG.api_key;
    const secret = FLATTRADE_CONFIG.api_secret;

    if (key.includes("ENTER_YOUR")) {
        console.log(`\n❌ KEYS MISSING! Run 'node configure.js' to fix.\n`);
    } else {
        console.log(`\n🔑 CONFIG CHECK:`);
        console.log(`   API Key Length:    ${key.length} chars (OK)`);
        if (secret.length !== 32) {
             console.log(`   API Secret Length: ${secret.length} chars (❌ INVALID - SHOULD BE 32!)`);
             console.log(`   👉 RUN 'node configure.js' TO FIX THIS.\n`);
        } else {
             console.log(`   API Secret Length: ${secret.length} chars (OK)`);
        }
    }

    await restoreSession();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} in use. Run 'pkill node' and try again.\n`);
        process.exit(1);
    }
});