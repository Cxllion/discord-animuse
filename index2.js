require('dotenv').config();

// ============================================
// TEST BOT INSTANCE
// Clear module cache and override CLIENT_ID BEFORE imports
// This ensures command deployer uses test bot ID
// ============================================

// Clear command deployer from cache if it exists
const deployerPath = require.resolve('./utils/core/commandDeployer');
if (require.cache[deployerPath]) {
    delete require.cache[deployerPath];
}

// Override CLIENT_ID before any imports
process.env.CLIENT_ID = process.env.TEST_CLIENT_ID;

// Disable command deployment for test bot (commands already exist from production bot)
process.env.DEPLOY_ON_START = 'false';

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { initializeBot } = require('./utils/core/init');
const logger = require('./utils/core/logger');

// Setup Process Safety
setupProcessHandlers();

// Validate Required Environment Variables (TEST versions)
const requiredEnvVars = ['TEST_DISCORD_TOKEN', 'TEST_CLIENT_ID'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    logger.error(`Missing required TEST environment variables: ${missingVars.join(', ')}`, null, 'TestBot-Startup');
    logger.error('Please add TEST_DISCORD_TOKEN and TEST_CLIENT_ID to your .env file.', null, 'TestBot-Startup');
    logger.info('These should be credentials for a separate test bot instance.', 'TestBot-Startup');
    process.exit(1);
}

// Log test mode
logger.info('🧪 Starting in TEST MODE with test bot credentials', 'TestBot-Startup');
logger.info(`Bot will use TEST_CLIENT_ID: ${process.env.TEST_CLIENT_ID}`, 'TestBot-Startup');

// Initialize Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // For member events
    ],
});

client.commands = new Collection();
client.isSystemsGo = false;

// Setup Client Safety
setupClientHandlers(client);

// Graceful Shutdown Handler
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, gracefully shutting down TEST bot...', 'TestBot-System');
    client.destroy();
    process.exit(0);
});

// Start Bot with TEST credentials
initializeBot(client).then(() => {
    client.login(process.env.TEST_DISCORD_TOKEN);
}).catch(err => {
    logger.error('Critical Initialization Failure (TEST BOT):', err, 'TestBot-Startup');
    process.exit(1);
});
