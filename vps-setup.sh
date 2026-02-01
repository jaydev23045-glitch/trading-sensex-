#!/bin/bash
echo "==========================================="
echo "   SENSEX HFT BOT - ONE CLICK SETUP"
echo "==========================================="

echo "1. Updating Linux System..."
sudo apt update -y
sudo apt upgrade -y

echo "2. Installing Node.js..."
sudo apt install -y nodejs npm git

echo "3. Installing Project Libraries (This takes time)..."
npm install
npm install express cors ws axios

echo "==========================================="
echo "   SETUP COMPLETE!"
echo "==========================================="
echo "NEXT STEPS:"
echo "1. Type: nano vps-server.js"
echo "2. Paste your Flattrade API Keys."
echo "3. Save and Exit."
echo "4. Type: npm run start-all"
