# Sensex HFT Scalper - VPS Setup Guide

## How to Install (Fresh Start)

1. **Connect to your VPS**.
2. **Clone the code** (or ensure files are present).
   ```bash
   git clone <YOUR_GITHUB_REPO_URL>
   cd <YOUR_REPO_NAME>
   ```
3. **Run the Setup Script**:
   ```bash
   bash vps-setup.sh
   ```
   *   **Step 1:** It will ask for your VPS IP first.
   *   **Step 2:** It will give you the **Redirect URL**.
   *   **Step 3:** Go to Flattrade, create the app with that URL.
   *   **Step 4:** Come back to the terminal and paste your User ID, API Key, and Secret.

4. **Start the App**:
   ```bash
   npm run start-all
   ```

5. **Open in Browser**:
   * Open `http://<YOUR_VPS_IP>:5173`
   * Click "LOGIN BROKER"