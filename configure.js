import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
    console.log("\n===========================================");
    console.log("   AUTOMATIC CONFIGURATION WIZARD");
    console.log("===========================================\n");
    
    // STEP 1: Get IP and Show URL
    const vpsIp = await question("1. Enter your VPS Public IP Address (e.g. 13.203.1.118): ");
    
    if (!vpsIp) {
        console.log("❌ IP Address is required.");
        process.exit(1);
    }

    const redirectUrl = `http://${vpsIp.trim()}:5173`;

    console.log("\n-----------------------------------------------------------");
    console.log("   STOP & ACTION REQUIRED");
    console.log("-----------------------------------------------------------");
    console.log("1. Go to your Flattrade API Dashboard.");
    console.log("2. Paste this into the 'Redirect URL' box:");
    console.log(`\n   👉  ${redirectUrl}  👈\n`);
    console.log("3. Click 'Create App' or 'Save'.");
    console.log("4. Copy the API Key and Secret displayed on the website.");
    console.log("-----------------------------------------------------------\n");

    // STEP 2: Get Keys
    const userId = await question("2. Enter Flattrade User ID (e.g. FT12345): ");
    const apiKey = await question("3. Enter Flattrade API Key: ");
    const apiSecret = await question("4. Enter Flattrade API Secret: ");
    
    if (!apiKey || !apiSecret || !userId) {
        console.log("\n❌ Error: You must provide all details. Please try again.");
        process.exit(1);
    }

    try {
        let content = fs.readFileSync('vps-server.js', 'utf8');
        
        // Check if already configured
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
        // Handle case where file was already edited but we are overwriting
        if (!content.includes('ENTER_YOUR_API_KEY_HERE')) {
            // Regex replacement for existing strings would be complex, assuming fresh or placeholder
            // If overwriting without placeholders, we might need a more robust regex, 
            // but for this specific flow, let's assume standard placeholder presence or manual reset.
            // For safety, let's rely on the file having placeholders if it's a fresh install.
            // If it's a re-run, the user might need to git checkout the file again or we do a smarter replace.
            // For now, let's try to match the variable pattern if placeholder is gone.
            content = content.replace(/api_key:\s*".*?"/, `api_key: "${apiKey.trim()}"`);
            content = content.replace(/api_secret:\s*".*?"/, `api_secret: "${apiSecret.trim()}"`);
            content = content.replace(/user_id:\s*".*?"/, `user_id: "${userId.trim()}"`);
            content = content.replace(/redirect_url:\s*".*?"/, `redirect_url: "${redirectUrl}"`);
        } else {
             content = content.replace(/ENTER_YOUR_API_KEY_HERE/g, apiKey.trim());
             content = content.replace(/ENTER_YOUR_API_SECRET_HERE/g, apiSecret.trim());
             content = content.replace(/ENTER_YOUR_USER_ID_HERE/g, userId.trim());
             content = content.replace(/ENTER_YOUR_REDIRECT_URL_HERE/g, redirectUrl);
        }

        fs.writeFileSync('vps-server.js', content);
        
        console.log("\n✅ CONFIGURATION SAVED!");
        console.log("-----------------------------------------------------------");
        console.log("You can now start the app with:");
        console.log("npm run start-all");
    } catch (err) {
        console.error("\n❌ Error writing file:", err.message);
    }
    
    rl.close();
})();