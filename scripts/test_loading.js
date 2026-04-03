const fs = require('fs');
const path = require('path');

const filesToTest = [
    './utils/core/errorHandler.js',
    './commands/general/userinfo.js',
    './commands/moderation/ban.js',
    './utils/handlers/profileHandlers.js',
    './events/interactionCreate.js'
];

console.log('--- Testing Module Loads ---');

for (const file of filesToTest) {
    try {
        require(path.resolve(process.cwd(), file));
        console.log(`✅ [SUCCESS] Loaded ${file}`);
    } catch (e) {
        console.error(`❌ [FAILURE] Failed to load ${file}:`);
        console.error(e.stack);
    }
}
