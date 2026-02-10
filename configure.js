import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
    console.log("\n===========================================");
    console.log("   🛠️  SENSEX HFT - KEY FIXER WIZARD");
    console.log("===========================================\n");
    console.log("This script will overwrite your existing configuration with new, clean keys.");
    
    // --- STEP 1: IP ADDRESS ---
    let vpsIp = await question("1. Enter VPS IP (Leave empty to keep current): ");
    let redirectUrl = "";
    
    if (vpsIp.trim().length > 0) {
        redirectUrl = `http://${vpsIp.trim()}:5173`;
        console.log(`\n   ✅ Setting Redirect URL to: ${redirectUrl}`);
    } else {
        console.log("   Unknown IP. Assuming localhost or existing config.");
    }

    console.log("\n-----------------------------------------------------------");
    console.log("   OPEN FLATTRADE DASHBOARD NOW");
    console.log("-----------------------------------------------------------");

    // --- STEP 2: USER ID ---
    let userId = await question("2. Enter User ID (e.g. FT00001): ");
    while (userId.trim().length < 5) {
        console.log("   ❌ Invalid User ID. Try again.");
        userId = await question("2. Enter User ID: ");
    }

    // --- STEP 3: API KEY ---
    let apiKey = await question("3. Enter API Key: ");
    while (apiKey.trim().length < 10) {
        console.log("   ❌ API Key looks too short. Please copy the full key.");
        apiKey = await question("3. Enter API Key: ");
    }

    // --- STEP 4: API SECRET (CRITICAL FIX) ---
    console.log("\n⚠️  IMPORTANT: The API Secret is usually 32 characters long.");
    let apiSecret = await question("4. Enter API Secret: ");
    
    // Clean input (remove spaces, quotes if user pasted them)
    let cleanSecret = apiSecret.trim().replace(/['"]/g, '');
    
    if (cleanSecret.length !== 32) {
        console.log(`\n   ⚠️  WARNING: Your Secret is ${cleanSecret.length} characters long.`);
        console.log("   Standard Flattrade secrets are exactly 32 characters.");
        const confirm = await question("   Are you sure this is correct? (y/n): ");
        if (confirm.toLowerCase() !== 'y') {
            cleanSecret = await question("   Please paste the CORRECT 32-char Secret: ");
            cleanSecret = cleanSecret.trim().replace(/['"]/g, '');
        }
    }

    // --- WRITE TO FILE ---
    try {
        let content = fs.readFileSync('vps-server.js', 'utf8');

        // Regex to robustly replace existing values (handles both placeholders and existing keys)
        // 1. Replace API Key
        content = content.replace(/api_key:\s*["'].*?["']/, `api_key: "${apiKey.trim()}"`);
        // 2. Replace API Secret
        content = content.replace(/api_secret:\s*["'].*?["']/, `api_secret: "${cleanSecret}"`);
        // 3. Replace User ID
        content = content.replace(/user_id:\s*["'].*?["']/, `user_id: "${userId.trim()}"`);
        
        // 4. Replace URL only if provided
        if (redirectUrl) {
            content = content.replace(/redirect_url:\s*["'].*?["']/, `redirect_url: "${redirectUrl}"`);
        }

        fs.writeFileSync('vps-server.js', content);
        
        console.log("\n===========================================");
        console.log("   ✅ KEYS UPDATED SUCCESSFULLY!");
        console.log("===========================================");
        console.log("To apply changes, run this command now:");
        console.log("\n   npm run start-all\n");
        console.log("Then try logging in again.");
        
    } catch (err) {
        console.error("\n❌ Error writing file:", err.message);
        console.log("Make sure you are in the 'trading-sensex' folder.");
    }
    
    rl.close();
})();