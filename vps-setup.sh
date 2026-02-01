#!/bin/bash
echo "--- 1. Updating System ---"
sudo apt update -y
echo "--- 2. Installing Node.js & NPM ---"
sudo apt install -y nodejs npm
echo "--- 3. Installing Project Dependencies ---"
npm install express cors ws axios crypto
echo "--- 4. Setup Complete! ---"
echo "NEXT STEPS: Edit vps-server.js to add API KEYS, then run: node vps-server.js"