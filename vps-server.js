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
    const loginUrl = `https://auth.flattrade.in/?app_key=${FLATTRADE_CONFIG.api_key}`; 
    console.log("Serving Login URL:", loginUrl);
    res.json({ url: loginUrl }); 
});

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    try {
        const rawString = FLATTRADE_CONFIG.api_key + code + FLATTRADE_CONFIG.api_secret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { 
            api_key: FLATTRADE_CONFIG.api_key, 
            request_code: code, 
            api_secret: apiSecretHash 
        });
        if (response.data.token) {
            flattradeToken = response.data.token;
            console.log("✅ Login Successful. Token obtained.");
            startWebSocket(flattradeToken);
            res.json({ success: true, token: flattradeToken });
        } else { 
            throw new Error("No token in response"); 
        }
    } catch (error) { 
        console.error("Auth Error:", error.response?.data || error.message);
        res.status(500).json({ error: 'Auth failed', details: error.response?.data || error.message }); 
    }
});

// --- NEW FUNDS ENDPOINT ---
app.get('/funds', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'VPS: Not logged in to Flattrade' });
    try {
        const payload = { uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id };
        // Fetch Limits from Flattrade
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
        console.log("VPS Placing Order:", orderData.symbol, orderData.type, orderData.side);
        const payload = { ...orderData, uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id };
        
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
        const connectReq = { t: "c", uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id, source: "API" };
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
    
    const loginUrl = `https://auth.flattrade.in/?app_key=${FLATTRADE_CONFIG.api_key}`;
    console.log(`\n===========================================================`);
    console.log(`🔑 MANUAL LOGIN LINK (If button fails, copy this URL):`);
    console.log(`👉 ${loginUrl}`);
    console.log(`===========================================================\n`);
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