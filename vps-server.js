import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import crypto from 'crypto';

// 1. GLOBAL ERROR HANDLERS TO PREVENT CRASHES
process.on('uncaughtException', (err) => { 
    console.error('CRITICAL ERROR (Uncaught):', err); 
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 5000;
const WS_PORT = 8080;

// ⚠️⚠️⚠️ IMPORTANT: IF YOU SEE "ENTER_YOUR_..." BELOW, YOU MUST EDIT THIS FILE! ⚠️⚠️⚠️
// Run 'nano vps-server.js' to edit these values manually.
const FLATTRADE_CONFIG = {
    api_key: "ENTER_YOUR_API_KEY_HERE",
    api_secret: "ENTER_YOUR_API_SECRET_HERE",
    user_id: "ENTER_YOUR_USER_ID_HERE", 
    redirect_url: "ENTER_YOUR_REDIRECT_URL_HERE" 
};

// 2. ENABLE CORS FOR ALL ORIGINS
app.use(cors({ origin: '*' }));
app.use(express.json());

// 3. REQUEST LOGGER
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

let flattradeToken = null;
let marketSocket = null;

app.get('/', (req, res) => { res.send("VPS Server is Running! Status: " + (flattradeToken ? "Logged In" : "Waiting for Login")); });

// Ping endpoint for health checks
app.get('/ping', (req, res) => res.send('pong'));

// --- NEW AUTH CHECK ENDPOINT ---
app.get('/check-auth', (req, res) => {
    res.json({ isLoggedIn: !!flattradeToken });
});

app.get('/login', (req, res) => { 
    // VALIDATION: Check if keys are configured
    if (FLATTRADE_CONFIG.api_key.includes("ENTER_YOUR")) {
        console.error("❌ ERROR: API Key is not configured in vps-server.js");
        return res.status(500).json({ 
            error: "CONFIGURATION_ERROR", 
            message: "API Keys are missing. Please run 'nano vps-server.js' and enter your keys." 
        });
    }
    
    // Trim keys just in case user added spaces in the config
    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const loginUrl = `https://auth.flattrade.in/?app_key=${cleanKey}`; 
    console.log("Serving Login URL:", loginUrl);
    res.json({ url: loginUrl }); 
});

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    
    // VALIDATION: Check if keys are configured
    if (FLATTRADE_CONFIG.api_key.includes("ENTER_YOUR") || FLATTRADE_CONFIG.api_secret.includes("ENTER_YOUR")) {
         return res.status(400).json({ 
            error: "KEYS_MISSING", 
            details: { emsg: "You have not entered your API Keys in vps-server.js. Please edit the file manually." } 
        });
    }

    // 🛡️ SECURITY FIX: Trim spaces from keys to prevent Hash Mismatch
    const cleanKey = FLATTRADE_CONFIG.api_key.trim();
    const cleanSecret = FLATTRADE_CONFIG.api_secret.trim();
    
    console.log(`\n🔑 ATTEMPTING LOGIN...`);
    // console.log(`Key: ${cleanKey.substring(0,4)}... | Code: ${code} | Secret: ${cleanSecret.substring(0,4)}...`);
    
    try {
        const rawString = cleanKey + code + cleanSecret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { 
            api_key: cleanKey, 
            request_code: code, 
            api_secret: apiSecretHash 
        });
        
        console.log("Flattrade Auth Response:", JSON.stringify(response.data));

        // CHECK FOR BROKER REJECTION (Explicit)
        if (response.data.stat === "Not_Ok") {
            console.error("❌ Broker Rejected:", response.data.emsg);
            return res.status(400).json({ 
                error: response.data.emsg, 
                details: response.data 
            });
        }

        // CHECK FOR SUCCESS
        if (response.data.token) {
            flattradeToken = response.data.token;
            console.log("✅ Login Successful. Token obtained.");
            startWebSocket(flattradeToken);
            res.json({ success: true, token: flattradeToken });
        } else { 
            // CATCH-ALL: Status was OK, but Token missing (e.g., Weird Broker State)
            console.error("❌ No token in valid response:", response.data);
            res.status(500).json({ 
                error: "Broker returned Invalid Data (No Token)", 
                details: response.data 
            });
        }
    } catch (error) { 
        console.error("❌ Auth Error:", error.response?.data || error.message);
        const errorDetails = error.response?.data || { message: error.message };
        res.status(401).json({ error: 'Auth failed', details: errorDetails }); 
    }
});

// --- NEW FUNDS ENDPOINT ---
app.get('/funds', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'VPS: Not logged in to Flattrade' });
    try {
        const userId = FLATTRADE_CONFIG.user_id.trim();
        const payload = { uid: userId, actid: userId };
        
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', payload, { 
            headers: { Authorization: `Bearer ${flattradeToken}` } 
        });

        if (response.data.stat === "Not_Ok") {
            console.error("Funds Fetch Failed:", response.data.emsg);
            return res.status(400).json({ error: response.data.emsg });
        }
        res.json(response.data);
    } catch (e) {
        console.error("Funds API Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/place-order', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'VPS: Not logged in to Flattrade' });
    try {
        const orderData = req.body;
        const userId = FLATTRADE_CONFIG.user_id.trim();
        console.log("VPS Placing Order:", orderData.symbol, orderData.type, orderData.side);
        
        const payload = { ...orderData, uid: userId, actid: userId };
        
        // Use Flattrade PlaceOrder API
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/PlaceOrder', payload, { 
            headers: { Authorization: `Bearer ${flattradeToken}` } 
        });
        
        // Flattrade returns 200 OK even for some logical errors (stat: "Not_Ok"), so check that.
        if (response.data.stat === "Not_Ok") {
            console.error("Broker Rejected:", response.data.emsg);
            return res.status(400).json({ error: response.data.emsg, details: response.data });
        }

        res.json(response.data);
    } catch (e) { 
        // Capture detailed broker error if available
        const brokerError = e.response?.data?.emsg || e.response?.data?.message || JSON.stringify(e.response?.data) || e.message;
        console.error("Order Failed:", brokerError); 
        res.status(500).json({ error: brokerError }); 
    }
});

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });

function startWebSocket(token) {
    if (marketSocket) { try { marketSocket.close(); } catch(e) {} }
    marketSocket = new WebSocket('wss://piconnect.flattrade.in/PiConnectTP/websocket');
    marketSocket.on('open', () => {
        console.log('✅ VPS connected to Flattrade Market Data');
        const userId = FLATTRADE_CONFIG.user_id.trim();
        const connectReq = { t: "c", uid: userId, actid: userId, source: "API" };
        marketSocket.send(JSON.stringify(connectReq));
        setTimeout(() => { const subscribeReq = { t: "t", k: "NFO|56000,NFO|56001" }; marketSocket.send(JSON.stringify(subscribeReq)); }, 1000);
    });
    marketSocket.on('message', (data) => { 
        wss.clients.forEach(client => { 
            if (client.readyState === WebSocket.OPEN) { 
                client.send(data.toString()); 
            } 
        }); 
    });
    marketSocket.on('error', (err) => console.error("Flattrade WS Error:", err));
    marketSocket.on('close', () => console.log("Flattrade WS Closed"));
}

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ VPS Server running on Port ${PORT}`);
    console.log(`✅ WebSocket running on Port ${WS_PORT}`);
    
    // Check Config on Startup
    if (FLATTRADE_CONFIG.api_key.includes("ENTER_YOUR")) {
        console.log(`\n❌❌❌ WARNING: API KEYS ARE NOT CONFIGURED! ❌❌❌`);
        console.log(`Please run: nano vps-server.js`);
        console.log(`And edit the keys manually.\n`);
    } else {
        const cleanKey = FLATTRADE_CONFIG.api_key.trim();
        const loginUrl = `https://auth.flattrade.in/?app_key=${cleanKey}`;
        console.log(`\n===========================================================`);
        console.log(`🔑 MANUAL LOGIN LINK:`);
        console.log(`👉 ${loginUrl}`);
        console.log(`===========================================================\n`);
    }
});

// 4. CHECK FOR PORT CONFLICTS
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n❌ CRITICAL ERROR: Port ${PORT} is already in use!`);
        console.error(`   This usually means an old version of the server is still running.`);
        console.error(`   Solution: Run 'pkill node' to stop all servers, then start again.\n`);
        process.exit(1);
    } else {
        console.error("Server Error:", e);
    }
});