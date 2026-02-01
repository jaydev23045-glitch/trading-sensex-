#!/bin/bash
echo "==========================================="
echo "   SENSEX HFT BOT - ONE CLICK SETUP"
echo "==========================================="

echo "1. Updating Linux System..."
sudo apt update -y

echo "2. Installing Node.js..."
sudo apt install -y nodejs npm git

echo "3. Installing Project Libraries..."
npm install
# Ensure specific packages are present
npm install express cors ws axios

echo "4. Running Configuration Wizard..."
# Run the interactive configuration script
node configure.js

echo "==========================================="
echo "   SETUP COMPLETE!"
echo "==========================================="
echo "To start the app, type this command:"
echo ""
echo "npm run start-all"
echo ""
echo "==========================================="
