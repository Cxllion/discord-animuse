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

// 2. Client Instance (STRICT BASE INTENTS ONLY)
// Removing GuildMembers and GuildPresences to ensure login works even without Portal approval.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    rest: { timeout: 60000 }
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false;

// 3. Client Handlers
setupClientHandlers(client);
client.on('debug', info => {
    if (info.includes('WebSocket') || info.includes('IDENTIFY')) {
        logger.debug(info, 'Handshake');
    }
});

// 4. Health Check Server (Immediate)
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Connection': 'close' });
    res.write('AniMuse Library: ONLINE');
    res.end();
});

server.listen(port, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${port} (Render Health Check)`, 'System');
});

// 5. Direct Sequential Boot
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        const tokenPrefix = (process.env.DISCORD_TOKEN || "").substring(0, 4);
        logger.info(`Initiating Handshake with Discord Gateway (Token: ${tokenPrefix}***)...`, 'System');
        await client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        logger.error('Startup Critical Failure:', error, 'System');
        process.exit(1);
    }
})();

// 6. Clean Shutdown Sequence
const handleShutdown = async (signal) => {
    logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
    if (server.listening) server.close();
    client.destroy();
    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Pulse Monitor
setInterval(() => {
    if (client.isReady()) {
        const memory = process.memoryUsage();
        const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
        logger.info(`Pulse: OK (Heap: ${heapUsed}MB)`, 'System');
    } else {
        logger.info('Handshake still in progress...', 'System');
    }
}, 30000);
