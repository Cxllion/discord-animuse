const logger = require('../utils/core/logger');
// Mocking some dependencies relative to this test file
// router.js initializes itself, so we just require it.

async function test() {
    console.log("--- Router Verification ---");
    try {
        const { routeInteraction } = require('../utils/handlers/router');
        const registry = require('../utils/handlers/routerRegistry');
        
        console.log(`Registered Handlers: ${registry.handlers.length}`);
        
        const testIds = [
            'profile_home',
            'mafia_join_123',
            'search_result_select',
            'help_mafia',
            'role_dash_menu'
        ];

        for (const id of testIds) {
            const handler = registry.findHandler(id);
            console.log(`Checking [${id}]: ${handler ? 'FOUND' : 'NOT FOUND'}`);
            if (!handler) process.exit(1);
        }

        console.log("\n✅ All core prefixes successfully registered via auto-discovery.");
    } catch (e) {
        console.error("❌ Router Verification Failed:");
        console.error(e);
        process.exit(1);
    }
}

test();
