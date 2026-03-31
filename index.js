const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts (for Render consistency)
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

// Validate Environment Variables
const { validateEnv } = require('./utils/core/envManager');
validateEnv();

// Create simple HTTP server for Render health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    // Detailed logging for health checks
    logger.debug(`Incoming Health Check: ${req.method} ${req.url}`, 'System');
    
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            bot: 'AniMuse',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} is already in use. Health-check logic will skip port binding.`, 'System');
    } else {
        logger.error(`HTTP server error:`, e, 'System');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${PORT} (for Render health checks)`, 'System');
});

// Initialize Client (Matched with index2.js for stability)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    rest: {
        timeout: 60000,
    }
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false;

// Setup Client Safety
setupClientHandlers(client);

// Debug Listeners for Handshake visibility on Render
client.on('error', err => logger.error('Discord Shard Error:', err, 'Handshake'));
client.on('shardError', error => logger.error('A websocket connection encountered an error:', error, 'Handshake'));

// Graceful Shutdown Handler
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, gracefully shutting down...', 'System');
    server.close();
    client.destroy();
    process.exit(0);
});

// Start Bot with Fast-Login Strategy
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'Startup');
        
        // Step 1: Load Core Resources (Commands, Events) - Must happen before login
        loadCoreResources(client);

        // Step 2: Immediate Discord Login (Appears online FAST)
        logger.info('Connecting to the Grand Archivist (Discord Gateway)...', 'Startup');
        await client.login(process.env.DISCORD_TOKEN);
        
        // Step 3: Background Initialization (Database, Schedulers)
        // We do NOT await this to prevent it from blocking the health check window
        initializeDatabase(client);

    } catch (err) {
        logger.error('Critical Startup Failure:', err, 'Startup');
        setTimeout(() => process.exit(1), 1000);
    }
})();
