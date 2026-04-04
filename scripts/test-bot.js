const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('../utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('../utils/core/init');
const logger = require('../utils/core/logger');
const http = require('http');

// ==========================================
// TEST BOT INSTANCE (INDEX2.JS)
// ==========================================

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts
const { loadCustomFonts } = require('../utils/core/fonts');
loadCustomFonts();

// Override credentials for test bot
process.env.TEST_MODE = 'true';
process.env.CLIENT_ID = process.env.TEST_CLIENT_ID;
process.env.DISCORD_TOKEN = process.env.TEST_DISCORD_TOKEN;

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
client.isTestBot = true;

// Setup Client Safety
setupClientHandlers(client);

// Basic HTTP server for satisfying platform health checks
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Animuse Test Library: ONLINE');
    res.end();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} is already in use by another instance. Skipping health-check server startup, but continuing with the bot...`, 'System');
    } else {
        logger.error('Web Server Error:', e, 'System');
    }
});

server.listen(port);
(async () => {
    try {
        logger.info(`Starting Test Environment (Port ${port})...`, 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        await client.login(process.env.DISCORD_TOKEN);

        // --- Graceful Shutdown Sequence ---
        const handleShutdown = async (signal) => {
            logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
            
            // 1. Close Health Server
            if (server.listening) {
                server.close(() => logger.info('[ShutDown] HTTP archives locked and secured.', 'System'));
            }

            // 2. Clear Active Intervals
            if (client.intervals) {
                client.intervals.forEach(clearInterval);
                logger.info(`[ShutDown] Terminated ${client.intervals.length} background tasks.`, 'System');
            }
            
            // 3. Destroy Discord Session (Logs out cleanly)
            client.destroy();
            logger.info('[ShutDown] Discord archivist connection terminated.', 'System');

            // 3. Exit process (Wait briefly for logs)
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        };

        process.on('SIGINT', () => handleShutdown('SIGINT'));
        process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    } catch (error) {
        logger.error('Startup Critical Failure:', error, 'System');
        process.exit(1);
    }
})();
