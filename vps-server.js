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
const CONFIG_FILE = 'config.json';

// LOAD CONFIGURATION
let FLATTRADE_CONFIG = {
    api_key: "",
    api_secret: "",
    user_id: "",
    redirect_url: ""
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const rawConfig = fs.readFileSync(CONFIG_FILE, 'utf8');
        FLATTRADE_CONFIG = JSON.parse(rawConfig);
        console.log("✅ Configuration loaded from config.json");
    } catch (e) {
        console.error("❌ Error reading config.json:", e.message);
    }
} else {
    console.log("⚠️  config.json not found. Using defaults (Login might fail).");
    console.log("👉 Run 'node configure.js' to setup credentials.");
}

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
            date: new Date().toDateString() 
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
        
        if (data.date !== new Date().toDateString()) {
            console.log("⚠️ Session expired (Yesterday). Please login again.");
            fs.unlinkSync(TOKEN_FILE);
            return;
        }

        console.log("🔄 Restoring previous session...");
        
        if (!FLATTRADE_CONFIG.user_id) return;
        
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
app.get('/ping', (req, res) => res.send('pong'));
app.get('/check-auth', (req, res) => { res.json({ isLoggedIn: !!flattradeToken }); });

app.get('/login', (req, res) => { 
    if (!FLATTRADE_CONFIG.api_key) {
        return res.status(500).json({ error: "CONFIG_MISSING", message: "Run 'node configure.js' first." });
    }
    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const loginUrl = `https://auth.flattrade.in/?app_key=${cleanKey}`; 
    console.log("Serving Login URL:", loginUrl);
    res.json({ url: loginUrl }); 
});

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    
    if (!code) return res.status(400).json({ error: "No Code", message: "Login code missing." });
    if (!FLATTRADE_CONFIG.api_key || !FLATTRADE_CONFIG.api_secret) {
         return res.status(400).json({ error: "CONFIG_MISSING", details: "Run 'node configure.js' on VPS." });
    }

    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const cleanSecret = FLATTRADE_CONFIG.api_secret.trim();
    
    console.log(`\n🔑 ATTEMPTING LOGIN with Code: ${code.substring(0,5)}...`);
    
    try {
        const rawString = cleanKey + code + cleanSecret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { 
            api_key: cleanKey, 
            request_code: code, 
            api_secret: apiSecretHash 
        });
        
        // Log Broker Response for debugging
        if (response.data.stat === "Not_Ok") {
            console.log("❌ BROKER REJECTED LOGIN:", response.data.emsg);
            return res.status(400).json({ error: response.data.emsg, details: response.data });
        }

        console.log("✅ BROKER ACCEPTED LOGIN");

        if (response.data.token) {
            flattradeToken = response.data.token;
            saveSession(flattradeToken);
            startWebSocket(flattradeToken);
            return res.json({ success: true, token: flattradeToken });
        } else { 
            return res.status(500).json({ error: "No Token", details: response.data });
        }
    } catch (error) { 
        console.error("❌ Auth Request Failed:", error.message);
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
    
    // CONFIG CHECK
    if (!FLATTRADE_CONFIG.api_key) {
        console.log(`\n❌ CONFIG MISSING! Run 'node configure.js' to fix.\n`);
    } else {
        console.log(`\n🔑 System Configured for User: ${FLATTRADE_CONFIG.user_id}`);
    }

    await restoreSession();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} in use. Run 'pkill node' and try again.\n`);
        process.exit(1);
    }
});