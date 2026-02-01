import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
    console.log("\n===========================================");
    console.log("   AUTOMATIC CONFIGURATION WIZARD");
    console.log("===========================================\n");
    console.log("I will help you set up your API Keys so you don't have to edit files manually.\n");
    
    const apiKey = await question("1. Enter Flattrade API Key: ");
    const apiSecret = await question("2. Enter Flattrade API Secret: ");
    const userId = await question("3. Enter Flattrade User ID (e.g. FT12345): ");
    
    if (!apiKey || !apiSecret || !userId) {
        console.log("\n❌ Error: You must provide all details. Please try again.");
        process.exit(1);
    }

    try {
        let content = fs.readFileSync('vps-server.js', 'utf8');
        
        // Simple check to ensure we are editing the right file
        if (!content.includes('ENTER_YOUR_API_KEY_HERE') && !content.includes(apiKey.trim())) {
            console.log("\n⚠️  Notice: It looks like vps-server.js was already configured.");
            const proceed = await question("Do you want to overwrite the existing keys? (y/n): ");
            if (proceed.toLowerCase() !== 'y') {
                console.log("Exiting without changes.");
                rl.close();
                process.exit(0);
            }
            // If overwriting, we might need a regex approach or just tell them to reset, 
            // but for this helper script, we assume the placeholders are there or we are just appending.
            // Since replacing placeholders is the safest 'fresh start' strategy:
            console.log("Note: Automatic overwrite only works on a fresh file. If this fails, please edit vps-server.js manually.");
        }

        // Perform Replacements
        content = content.replace(/ENTER_YOUR_API_KEY_HERE/g, apiKey.trim());
        content = content.replace(/ENTER_YOUR_API_SECRET_HERE/g, apiSecret.trim());
        content = content.replace(/ENTER_YOUR_USER_ID_HERE/g, userId.trim());

        fs.writeFileSync('vps-server.js', content);
        
        console.log("\n✅ SUCCESS! Keys have been saved to vps-server.js");
        console.log("You are ready to start the bot.");
    } catch (err) {
        console.error("\n❌ Error writing file:", err.message);
    }
    
    rl.close();
})();