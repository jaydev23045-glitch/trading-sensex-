import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const CONFIG_FILE = 'config.json';

(async () => {
    console.log("\n===========================================");
    console.log("   🛠️  SENSEX HFT - CONFIG WIZARD");
    console.log("===========================================\n");
    console.log("This will save your credentials to 'config.json'.");
    
    // --- STEP 1: IP ADDRESS ---
    let vpsIp = await question("1. Enter VPS IP (Leave empty to keep current): ");
    let redirectUrl = "";
    
    if (vpsIp.trim().length > 0) {
        redirectUrl = `http://${vpsIp.trim()}:5173`;
    } else {
        console.log("   Skipping IP update.");
    }

    // --- STEP 2: USER ID ---
    let userId = await question("2. Enter User ID (e.g. FT00001): ");
    while (userId.trim().length < 5) {
        console.log("   ❌ Invalid User ID.");
        userId = await question("2. Enter User ID: ");
    }

    // --- STEP 3: API KEY ---
    let apiKey = await question("3. Enter API Key: ");
    while (apiKey.trim().length < 10) {
        console.log("   ❌ API Key looks too short.");
        apiKey = await question("3. Enter API Key: ");
    }

    // --- STEP 4: API SECRET ---
    let apiSecret = await question("4. Enter API Secret: ");
    let cleanSecret = apiSecret.trim().replace(/['"]/g, '');
    
    if (cleanSecret.length !== 32) {
        console.log(`\n   ⚠️  WARNING: Secret is ${cleanSecret.length} chars (Expected 32).`);
        const confirm = await question("   Are you sure? (y/n): ");
        if (confirm.toLowerCase() !== 'y') {
            cleanSecret = await question("   Enter Correct Secret: ");
            cleanSecret = cleanSecret.trim().replace(/['"]/g, '');
        }
    }

    // --- SAVE TO CONFIG.JSON ---
    const configData = {
        api_key: apiKey.trim(),
        api_secret: cleanSecret,
        user_id: userId.trim(),
        redirect_url: redirectUrl
    };

    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
        
        console.log("\n===========================================");
        console.log("   ✅ CONFIGURATION SAVED!");
        console.log("===========================================");
        console.log("To apply changes, run:");
        console.log("\n   pkill node");
        console.log("   npm run start-all\n");
        
    } catch (err) {
        console.error("\n❌ Error saving file:", err.message);
    }
    
    rl.close();
})();