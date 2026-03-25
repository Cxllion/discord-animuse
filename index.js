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

server.listen(PORT, () => {
    logger.info(`HTTP server listening on port ${PORT} (for Render health checks)`, 'System');
});

// Initialize Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Required for members.fetch() and member events
    ],
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false; // Main instance

// Setup Client Safety
setupClientHandlers(client);

// Graceful Shutdown Handler (for production platforms like Render)
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, gracefully shutting down...', 'System');
    server.close();
    client.destroy();
    process.exit(0);
});

// Start Bot
initializeBot(client).then(() => {
    client.login(process.env.DISCORD_TOKEN);
}).catch(err => {
    logger.error('Critical Initialization Failure:', err, 'Startup');
    process.exit(1);
});
