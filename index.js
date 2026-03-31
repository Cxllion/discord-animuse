const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// 1. Core Setup
setupProcessHandlers();
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

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

// 2. Health Check Server (Immediate)
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('AniMuse Library: ONLINE');
    res.end();
});

server.listen(port, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${port} (Render Health Check)`, 'System');
});

// 3. Sequential Boot Sequence (Matches working index2.js)
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        logger.info('Initiating Handshake with Discord Gateway...', 'System');
        await client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        logger.error('Startup Critical Failure:', error, 'System');
        process.exit(1);
    }
})();

// 4. Clean Shutdown Sequence
const handleShutdown = async (signal) => {
    logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
    if (server.listening) server.close();
    client.destroy();
    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Simple Keep-Alive (matches index2.js)
setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
    logger.info(`Pulse: OK (Heap: ${heapUsed}MB)`, 'System');
}, 60000);
