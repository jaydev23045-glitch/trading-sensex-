#!/bin/bash
echo "==========================================="
echo "   SENSEX HFT BOT - ONE CLICK SETUP"
echo "==========================================="

# Ensure we are in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: You must be inside the 'trading-sensex' folder."
    echo "Try running: cd trading-sensex"
    exit 1
fi

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
# npm install is sufficient as per package.json, but explicit install ensures these exist for the server script if run independently
npm install express cors ws axios

echo "4. Creating Startup Shortcut..."
# Create a shortcut in the home directory so you don't need to cd every time
# We use $(pwd) to get the absolute path of the current folder
CURRENT_DIR=$(pwd)
cat <<EOT > ../start-bot.sh
#!/bin/bash
cd $CURRENT_DIR
echo "Starting Sensex HFT Bot..."
npm run start-all
EOT
chmod +x ../start-bot.sh

echo "5. Running Configuration Wizard..."
# Run the interactive configuration script
node configure.js

echo "==========================================="
echo "   SETUP COMPLETE!"
echo "==========================================="
echo "To start the app NOW, type:"
echo "npm run start-all"
echo ""
echo "-------------------------------------------"
echo "NEXT TIME YOU LOG IN (After Restart):"
echo "Just type: ./start-bot.sh"
echo "-------------------------------------------"
echo "==========================================="