# 🚀 Sensex HFT Scalper - Hybrid Architecture

This project uses a **Hybrid Setup** to minimize latency (slippage) while keeping a user-friendly Mac interface.

## 🏗 Architecture

1.  **The Brain (VPS):** A Node.js server (`vps-server.js`) running on a cloud server (AWS/DigitalOcean/Hetzner) in the same data center region as the exchange/broker. This handles the API calls and WebSocket execution.
2.  **The Body (Local Mac):** A React Dashboard running on your laptop. It connects to the VPS via a secure SSH Tunnel.

---

## 🛠 Phase 1: Local Setup (Mac)

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run Dashboard:**
    ```bash
    npm run dev
    ```
    *Access at:* `http://localhost:5173`

---

## ☁️ Phase 2: VPS Setup (The Engine)

### Option A: The Fast Way (Auto-Script)
I have included a script to do everything automatically.

1.  **Connect to VPS:**
    ```bash
    ssh ubuntu@YOUR_VPS_IP
    ```
2.  **Clone Repo:**
    ```bash
    git clone https://github.com/jaydev23045-glitch/VPS---SENSEX-TRADING-.git
    cd VPS---SENSEX-TRADING-
    ```
3.  **Run Setup:**
    ```bash
    bash vps-setup.sh
    ```

### Option B: Manual Setup
If you prefer to do it step-by-step:

1.  **Install Node.js:**
    ```bash
    sudo apt update
    sudo apt install -y nodejs npm
    ```
2.  **Install Libraries:**
    ```bash
    npm install express cors ws axios crypto
    ```
3.  **Edit Config:**
    Open `vps-server.js` and add your **Flattrade API Keys**.
    ```bash
    nano vps-server.js
    # Ctrl+O to save, Ctrl+X to exit
    ```
4.  **Start Server:**
    ```bash
    node vps-server.js
    ```

---

## 🔌 Phase 3: Connecting (The Tunnel)

To let your Mac talk to the VPS securely:

1.  Open VS Code on Mac.
2.  Connect to Remote Host (SSH to VPS).
3.  Go to the **PORTS** tab (bottom panel).
4.  **Forward Port 5000** (API).
5.  **Forward Port 8080** (WebSocket).

---

## ⚡️ Daily Trading Workflow

1.  **On VPS:** Ensure `node vps-server.js` is running.
2.  **On Mac:** Ensure `npm run dev` is running.
3.  **On Mac:** Ensure VS Code Ports (5000 & 8080) are forwarded.
4.  **In Browser:** Click **"LOGIN BROKER"** on the dashboard.
5.  **Trade:** The dashboard will now send orders to the VPS, which executes them instantly.
