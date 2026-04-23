/**
 * Animuse Test Bot Entry Point
 * 
 * Launch your development/test instance of Animuse.
 * This file automatically configures the environment for testing
 * and disables background conflicting tasks (Airing alerts, etc).
 */

// ==========================================
// 🧪 TEST ENVIRONMENT CONFIGURATION
// ==========================================

// 1. Load raw .env first
require('dotenv').config();

// 2. Set global flags BEFORE requiring any bot modules
process.env.TEST_MODE = 'true';

// 3. Override Discord credentials with Test variants
if (process.env.TEST_DISCORD_TOKEN) {
    process.env.DISCORD_TOKEN = process.env.TEST_DISCORD_TOKEN;
}
if (process.env.TEST_CLIENT_ID) {
    process.env.CLIENT_ID = process.env.TEST_CLIENT_ID;
}

// Now we can safely load bot resources
const logger = require('./utils/core/logger');
logger.info('🧪 [SYSTEM] ANIMUSE TEST ARCHIVES STARTING... ♡', 'System');

// 4. Delegate execution to the main optimized bot logic
require('./index.js');
