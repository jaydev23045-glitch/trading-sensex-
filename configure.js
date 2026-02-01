import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
    console.log("\n===========================================");
    console.log("   AUTOMATIC CONFIGURATION WIZARD");
    console.log("===========================================\n");
    
    const apiKey = await question("1. Enter Flattrade API Key: ");
    const apiSecret = await question("2. Enter Flattrade API Secret: ");
    const userId = await question("3. Enter Flattrade User ID (e.g. FT12345): ");
    const vpsIp = await question("4. Enter your VPS Public IP Address (e.g. 123.45.67.89): ");
    
    if (!apiKey || !apiSecret || !userId || !vpsIp) {
        console.log("\n❌ Error: You must provide all details. Please try again.");
        process.exit(1);
    }

    // Calculate the Redirect URL
    const redirectUrl = `http://${vpsIp.trim()}:5173`;

    try {
        let content = fs.readFileSync('vps-server.js', 'utf8');
        
        // Simple check
        if (!content.includes('ENTER_YOUR_API_KEY_HERE') && !content.includes(apiKey.trim())) {
            console.log("\n⚠️  Notice: It looks like vps-server.js was already configured.");
            const proceed = await question("Overwrite existing keys? (y/n): ");
            if (proceed.toLowerCase() !== 'y') {
                rl.close();
                process.exit(0);
            }
        }

        // Perform Replacements
        content = content.replace(/ENTER_YOUR_API_KEY_HERE/g, apiKey.trim());
        content = content.replace(/ENTER_YOUR_API_SECRET_HERE/g, apiSecret.trim());
        content = content.replace(/ENTER_YOUR_USER_ID_HERE/g, userId.trim());
        
        // Handle Redirect URL replacement (handle both placeholder and old localhost value if present)
        if (content.includes('ENTER_YOUR_REDIRECT_URL_HERE')) {
             content = content.replace(/ENTER_YOUR_REDIRECT_URL_HERE/g, redirectUrl);
        } else {
             content = content.replace(/http:\/\/localhost:5173/g, redirectUrl);
        }

        fs.writeFileSync('vps-server.js', content);
        
        console.log("\n✅ CONFIGURATION SAVED!");
        console.log("\n-----------------------------------------------------------");
        console.log("ACTION REQUIRED: Go to the Flattrade Dashboard (your screenshot)");
        console.log("-----------------------------------------------------------");
        console.log("1. Paste this into the 'Redirect URL' box:");
        console.log(`\n   👉  ${redirectUrl}  👈\n`);
        console.log("2. Click Save/Create App.");
        console.log("-----------------------------------------------------------");
        console.log("Then, start your app with: npm run start-all");
    } catch (err) {
        console.error("\n❌ Error writing file:", err.message);
    }
    
    rl.close();
})();