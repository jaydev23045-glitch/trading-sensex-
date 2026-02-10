import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

// 1. ERROR SAFETY
process.on('uncaughtException', (err) => console.error('CRITICAL ERROR:', err));
process.on('unhandledRejection', (r) => console.error('Unhandled Rejection:', r));

const app = express();
const PORT = 5000;
const WS_PORT = 8080;
const TOKEN_FILE = 'session_token.json';
const CONFIG_FILE = 'config.json';

// CONFIG
let FLATTRADE_CONFIG = { api_key: "", api_secret: "", user_id: "", redirect_url: "" };
if (fs.existsSync(CONFIG_FILE)) {
    try { FLATTRADE_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
}

app.use(cors({ origin: '*' }));
app.use(express.json());

let flattradeToken = null;
let marketSocket = null;

// --- SESSION ---
function saveSession(token) {
    try { fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, date: new Date().toDateString() })); } catch (e) {}
}

async function restoreSession() {
    if (!fs.existsSync(TOKEN_FILE)) return;
    try {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        if (data.date !== new Date().toDateString()) return;
        if (!FLATTRADE_CONFIG.user_id) return;
        
        // Validate Token
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', 
            { uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id }, 
            { headers: { Authorization: `Bearer ${data.token}` } } 
        );

        if (response.data.stat === "Ok") {
            flattradeToken = data.token;
            console.log("✅ SESSION RESTORED");
            startWebSocket(flattradeToken);
        }
    } catch (e) {}
}

// --- ROUTES ---
app.get('/ping', (req, res) => res.send('pong'));
app.get('/check-auth', (req, res) => res.json({ isLoggedIn: !!flattradeToken }));
app.get('/login', (req, res) => { 
    res.json({ url: `https://auth.flattrade.in/?app_key=${FLATTRADE_CONFIG.api_key}` }); 
});

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    try {
        const rawString = FLATTRADE_CONFIG.api_key + code + FLATTRADE_CONFIG.api_secret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { 
            api_key: FLATTRADE_CONFIG.api_key, request_code: code, api_secret: apiSecretHash 
        });
        
        if (response.data.stat === "Ok" && response.data.token) {
            flattradeToken = response.data.token;
            saveSession(flattradeToken);
            startWebSocket(flattradeToken);
            return res.json({ success: true, token: flattradeToken });
        }
        res.status(400).json(response.data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/funds', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'Not Logged In' });
    try {
        const uid = FLATTRADE_CONFIG.user_id;
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', 
            { uid, actid: uid }, { headers: { Authorization: `Bearer ${flattradeToken}` } }
        );
        res.json(response.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- NEW SEARCH SCRIP ENDPOINT ---
app.post('/search-scrip', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'Not Logged In' });
    try {
        const { search, exchange } = req.body;
        // Search API requires: uid, stext, exch
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/SearchScrip', {
            uid: FLATTRADE_CONFIG.user_id,
            stext: search,
            exch: exchange // 'NFO' or 'BFO'
        }, { headers: { Authorization: `Bearer ${flattradeToken}` } });

        if (response.data.stat === "Ok" && Array.isArray(response.data.values) && response.data.values.length > 0) {
            // Return first match (usually the most relevant)
            return res.json({ success: true, ts: response.data.values[0].ts, token: response.data.values[0].token });
        }
        res.json({ success: false, message: "Not Found" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- CORRECTED ORDER PLACEMENT ---
app.post('/place-order', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'Not Logged In.' });
    try {
        const d = req.body;
        const uid = FLATTRADE_CONFIG.user_id;
        
        // MAPPING TO FLATTRADE KEYS
        const payload = {
            uid: uid,
            actid: uid,
            exch: d.exchange, // NFO / BFO
            ts: d.symbol,     // TradingSymbol (validated via search)
            qty: String(d.qty),
            prc: String(d.price),
            prd: d.product === 'NRML' ? 'M' : 'I', // M=NRML, I=MIS
            trantype: d.side === 'BUY' ? 'B' : 'S',
            prctyp: d.type === 'LIMIT' ? 'LMT' : 'MKT',
            ret: 'DAY',
            ordersource: 'API'
        };

        console.log("Placing Order:", payload);

        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/PlaceOrder', payload, { 
            headers: { Authorization: `Bearer ${flattradeToken}` } 
        });
        
        console.log("Order Response:", response.data);
        res.json(response.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- WEBSOCKET WITH FORWARDING ---
const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });

function startWebSocket(token) {
    if (marketSocket) { try { marketSocket.terminate(); } catch(e) {} }
    
    marketSocket = new WebSocket('wss://piconnect.flattrade.in/PiConnectTP/websocket');
    
    marketSocket.on('open', () => {
        console.log('✅ Broker WS Connected');
        const uid = FLATTRADE_CONFIG.user_id;
        marketSocket.send(JSON.stringify({ t: "c", uid, actid: uid, source: "API" }));
    });
    
    marketSocket.on('message', (data) => {
        // Broadcast Broker Data to Client
        wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data.toString()); });
    });

    marketSocket.on('close', () => { setTimeout(() => { if(flattradeToken) startWebSocket(flattradeToken); }, 5000); });
}

// ALLOW CLIENT TO SUBSCRIBE VIA BACKEND PROXY
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        if (marketSocket && marketSocket.readyState === WebSocket.OPEN) {
            marketSocket.send(msg); // Forward subscription request from Frontend to Broker
        }
    });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ VPS Server running on Port ${PORT}`);
    if(FLATTRADE_CONFIG.api_key) await restoreSession();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} in use. Run 'pkill node' and try again.\n`);
        process.exit(1);
    }
});