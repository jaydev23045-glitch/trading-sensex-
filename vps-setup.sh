#!/bin/bash

# 🚀 VPS Auto-Setup Script for HFT Scalper
# Run this once on your VPS to prepare the environment.

echo "--- 1. Updating System ---"
sudo apt update -y

echo "--- 2. Installing Node.js & NPM ---"
sudo apt install -y nodejs npm

echo "--- 3. Installing Project Dependencies ---"
# Install the specific libraries needed for the Brain (Backend)
npm install express cors ws axios crypto

echo "--- 4. Setup Complete! ---"
echo ""
echo "NEXT STEPS:"
echo "1. Edit the config to add your API KEYS:"
echo "   nano vps-server.js"
echo ""
echo "2. Start the server:"
echo "   node vps-server.js"
