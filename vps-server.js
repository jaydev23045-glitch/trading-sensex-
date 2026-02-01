/**
 * VPS BACKEND SERVER - FLATTRADE BRIDGE
 * 
 * INSTRUCTIONS:
 * 1. Upload this file to your VPS.
 * 2. Run: npm install express cors ws axios crypto
 * 3. Run: node vps-server.js
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// --- CONFIGURATION ---
const PORT = 5000;
const WS_PORT = 8080;

// TODO: REPLACE THESE WITH YOUR REAL KEYS FROM FLATTRADE DASHBOARD
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

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.send("VPS Server is Running! Status: " + (flattradeToken ? "Logged In" : "Waiting for Login"));
});

// 1. Generate Login URL
app.get('/login', (req, res) => {
    const loginUrl = `https://auth.flattrade.in/?app_key=${FLATTRADE_CONFIG.api_key}`;
    res.json({ url: loginUrl });
});

// 2. Exchange Code for Token
app.post('/authenticate', async (req, res) => {
    const { code } = req.body;
    console.log("Received Auth Code:", code);
    
    try {
        // Create the SHA256 Hash required by Flattrade: SHA256(api_key + code + api_secret)
        const rawString = FLATTRADE_CONFIG.api_key + code + FLATTRADE_CONFIG.api_secret;
        const apiSecretHash = crypto.createHash('sha256').update(rawString).digest('hex');

        const response = await axios.post('https://authapi.flattrade.in/auth/session', {
            api_key: FLATTRADE_CONFIG.api_key,
            request_code: code,
            api_secret: apiSecretHash 
        });
        
        if (response.data.token) {
            flattradeToken = response.data.token;
            console.log("Login Successful. Token:", flattradeToken);
            startWebSocket(flattradeToken);
            res.json({ success: true, token: flattradeToken });
        } else {
            throw new Error("No token in response");
        }

    } catch (error) {
        console.error("Auth Failed:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Auth failed', details: error.response?.data });
    }
});

// 3. Place Order Proxy
app.post('/place-order', async (req, res) => {
    if (!flattradeToken) return res.status(401).json({ error: 'VPS: Not logged in to Flattrade' });
    
    try {
        const orderData = req.body;
        console.log("VPS Placing Order:", orderData.symbol);
        
        // Pass the required User ID to the order
        const payload = {
            ...orderData,
            uid: FLATTRADE_CONFIG.user_id,
            actid: FLATTRADE_CONFIG.user_id
        };
        
        const response = await axios.post('https://piconnect.flattrade.in/PiConnectTP/PlaceOrder', payload, {
            headers: { Authorization: `Bearer ${flattradeToken}` }
        });
        res.json(response.data);
    } catch (e) {
        console.error("Order Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ port: WS_PORT });

function startWebSocket(token) {
    if (marketSocket) marketSocket.close();

    marketSocket = new WebSocket('wss://piconnect.flattrade.in/PiConnectTP/websocket');
    
    marketSocket.on('open', () => {
        console.log('VPS connected to Flattrade Market Data');
        
        // Initial Connection Handshake
        const connectReq = {
            t: "c",
            uid: FLATTRADE_CONFIG.user_id,
            actid: FLATTRADE_CONFIG.user_id,
            source: "API",
        };
        marketSocket.send(JSON.stringify(connectReq));
        
        // Wait a moment then subscribe (You can customize tokens)
        setTimeout(() => {
             const subscribeReq = {
                t: "t",
                k: "NFO|56000,NFO|56001" // Example tokens
            };
            marketSocket.send(JSON.stringify(subscribeReq));
        }, 1000);
    });

    marketSocket.on('message', (data) => {
        // Forward data to local React App
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data.toString());
            }
        });
    });

    marketSocket.on('error', (err) => console.error("Flattrade WS Error:", err));
}

app.listen(PORT, () => console.log(`VPS Server running on http://localhost:${PORT}`));
