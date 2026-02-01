import express from 'express';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import crypto from 'crypto';

const app = express();
const PORT = 5000;
const WS_PORT = 8080;

const FLATTRADE_CONFIG = {
    api_key: "ENTER_YOUR_API_KEY_HERE",
    api_secret: "ENTER_YOUR_API_SECRET_HERE",
    user_id: "ENTER_YOUR_USER_ID_HERE", 
    redirect_url: "http://localhost:5173" 
};

app.use(cors());
app.use(express.json());

let flattradeToken = null;
let marketSocket = null;

app.get('/', (req, res) => { res.send("VPS Server is Running! Status: " + (flattradeToken ? "Logged In" : "Waiting for Login")); });
app.get('/login', (req, res) => { const loginUrl = `https://auth.flattrade.in/?app_key=${FLATTRADE_CONFIG.api_key}`; res.json({ url: loginUrl }); });

app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    try {
        const rawString = FLATTRADE_CONFIG.api_key + code + FLATTRADE_CONFIG.api_secret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');
        const response = await axios.post('https://authapi.flattrade.in/auth/session', { api_key: FLATTRADE_CONFIG.api_key, request_code: code, api_secret: apiSecretHash });
        if (response.data.token) {
            flattradeToken = response.data.token;
            console.log("Login Successful. Token:", flattradeToken);
            startWebSocket(flattradeToken);
            res.json({ success: true, token: flattradeToken });
        } else { throw new Error("No token in response"); }
    } catch (error) { res.status(500).json({ error: 'Auth failed', details: error.response?.data }); }
});

app.post('/place-order', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'VPS: Not logged in to Flattrade' });
    try {
        const orderData = req.body;
        console.log("VPS Placing Order:", orderData.symbol);
        const payload = { ...orderData, uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id };
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/PlaceOrder', payload, { headers: { Authorization: `Bearer ${flattradeToken}` } });
        res.json(response.data);
    } catch (e) { console.error("Order Error:", e.message); res.status(500).json({ error: e.message }); }
});

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });

function startWebSocket(token) {
    if (marketSocket) { try { marketSocket.close(); } catch(e) {} }
    marketSocket = new WebSocket('wss://piconnect.flattrade.in/PiConnectTP/websocket');
    marketSocket.on('open', () => {
        console.log('VPS connected to Flattrade Market Data');
        const connectReq = { t: "c", uid: FLATTRADE_CONFIG.user_id, actid: FLATTRADE_CONFIG.user_id, source: "API" };
        marketSocket.send(JSON.stringify(connectReq));
        setTimeout(() => { const subscribeReq = { t: "t", k: "NFO|56000,NFO|56001" }; marketSocket.send(JSON.stringify(subscribeReq)); }, 1000);
    });
    marketSocket.on('message', (data) => { wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) { client.send(data.toString()); } }); });
    marketSocket.on('error', (err) => console.error("Flattrade WS Error:", err));
}
process.on('uncaughtException', (err) => { console.error('CRITICAL ERROR:', err); });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ VPS Server running on Port ${PORT}`);
    console.log(`✅ WebSocket running on Port ${WS_PORT}`);
    console.log(`👉 If using from Mac: Ensure SSH Tunnel is active.`);
});