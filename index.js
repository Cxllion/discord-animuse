const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { initializeBot } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts (for Render consistency)
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

// Validate Environment Variables using Zod
const { validateEnv } = require('./utils/core/envManager');
validateEnv();

// Create simple HTTP server for Render health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    // Add logging to track Render health checks
    logger.debug(`Incoming Health Check: ${req.method} ${req.url}`, 'System');
    
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            bot: 'AniMuse',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} is already in use. Health-check server could not start, but the bot will continue running.`, 'System');
    } else {
        logger.error(`HTTP server error:`, e, 'System');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${PORT} (for Render health checks)`, 'System');
});

// Initialize Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, 
    ],
    rest: {
        timeout: 60000,
    }
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false;

// Setup Client Safety
setupClientHandlers(client);

// Graceful Shutdown Handler
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, gracefully shutting down...', 'System');
    server.close();
    client.destroy();
    process.exit(0);
});

// Start Bot with Enhanced Error Reporting
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'Startup');
        
        // 1. Core Systems & Database
        await initializeBot(client);
        
        // 2. Discord Connection
        logger.info('Authenticating with the Grand Archivist (Discord)...', 'Startup');
        await client.login(process.env.DISCORD_TOKEN);
        
    } catch (err) {
        logger.error('Critical Initialization Failure:', err, 'Startup');
        // Wait briefly for logs to flush before exiting
        setTimeout(() => process.exit(1), 1000);
    }
})();
