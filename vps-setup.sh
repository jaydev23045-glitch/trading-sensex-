#!/bin/bash
echo "==========================================="
echo "   SENSEX HFT BOT - ONE CLICK SETUP"
echo "==========================================="

echo "1. Cleaning old versions..."
# Remove old or broken node installations to prevent conflicts
sudo apt remove -y nodejs npm || true
sudo apt autoremove -y || true

echo "2. Installing Node.js 20 (Latest)..."
# This downloads the official NodeSource setup script for Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js and Git
sudo apt install -y nodejs git

# REFRESH SHELL PATH (Fixes 'node not found' error immediately after install)
hash -r

echo "3. Installing Project Libraries..."
# Remove old modules to ensure a fresh start
rm -rf node_modules
npm install
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