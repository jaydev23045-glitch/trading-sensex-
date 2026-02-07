# Sensex HFT Scalper - VPS Setup Guide

## Phase 1: GitHub Setup (Local PC)
1. Create a repository on GitHub named `trading-sensex`.
2. Upload all project files to this repository.

### ⚠️ Important: Authentication
GitHub does not accept your account password for terminal login.
1. If your repo is **Private**: You must generate a [Personal Access Token](https://github.com/settings/tokens). Select the `repo` scope. Use this Token as your password when asked.
2. If your repo is **Public**: You can clone without a password.

## Phase 2: VPS Installation
1. **Connect to your VPS**.
2. **Clone the code**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/trading-sensex.git
   cd trading-sensex
   ```
   *(If asked for password, use your Personal Access Token)*

3. **Run the Setup Script**:
   ```bash
   bash vps-setup.sh
   ```
   *   **Step 1:** Enter your VPS IP Address when asked.
   *   **Step 2:** Copy the **Redirect URL** provided.
   *   **Step 3:** Go to Flattrade Dashboard -> Create App -> Paste the URL.
   *   **Step 4:** Copy your User ID, API Key, and Secret back into the terminal.

4. **Start the App**:
   ```bash
   npm run start-all
   ```

5. **Open in Browser**:
   * Open `http://<YOUR_VPS_IP>:5173`
   * Click "LOGIN BROKER"

---

## 🆘 Troubleshooting

### "No such file or directory" error after restart?
When you restart your VPS, you start in the Home folder, not the project folder.
Run this command to go back into the folder:
```bash
cd trading-sensex
```
Then you can run your commands again.

### "Address already in use" error?
If the server is already running in the background:
```bash
pkill node
npm run start-all
```
