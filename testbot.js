/**
 * Animuse Test Bot Entry Point
 * 
 * Launch your development/test instance of Animuse.
 * This file automatically configures the environment for testing
 * and disables background conflicting tasks (Airing alerts, etc).
 */

require('dotenv').config();
const logger = require('./utils/core/logger');

// ==========================================
// 🧪 TEST ENVIRONMENT CONFIGURATION
// ==========================================

// 1. Set global flags
process.env.TEST_MODE = 'true';

// 2. Override Discord credentials with Test variants
if (process.env.TEST_DISCORD_TOKEN) {
    process.env.DISCORD_TOKEN = process.env.TEST_DISCORD_TOKEN;
}
if (process.env.TEST_CLIENT_ID) {
    process.env.CLIENT_ID = process.env.TEST_CLIENT_ID;
}

logger.info('🧪 [SYSTEM] ANIMUSE TEST ARCHIVES STARTING... ♡', 'System');

// 3. Delegate execution to the main optimized bot logic
// The bot will now inherit all sharding, performance, and stability fixes.
require('./index.js');
