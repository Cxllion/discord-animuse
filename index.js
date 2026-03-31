const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();

// --- CRITICAL NETWORK FIX FOR RENDER INTERFERENCE ---
// Discord's REST API is notoriously blackholed on Render's IPv6 configuration.
// Discord.js v14 relies on `undici` for its REST manager which tries IPv6 first by default.
// We force `undici` to use IPv4 (`family: 4`) to bypass the silent 60+ sec block.
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

try {
    const { setGlobalDispatcher, Agent } = require('undici');
    setGlobalDispatcher(new Agent({ connect: { timeout: 60000, family: 4 } }));
} catch (e) {
    console.warn('Undici not accessible for global dispatcher override.', e);
}

const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// ==========================================
// PRODUCTION BOT INSTANCE
// ==========================================

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts
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

// Setup Client Safety
setupClientHandlers(client);

// Basic HTTP server for satisfying platform health checks
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Animuse Library: ONLINE');
    res.end();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} is already in use by another instance. Skipping health-check server startup...`, 'System');
    } else {
        logger.error('Web Server Error:', e, 'System');
    }
});

server.listen(port, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${port} (Render Health Check)`, 'System');
});

(async () => {
    try {
        // --- REST PRE-FLIGHT CHECK ---
        logger.info('Performing REST Pre-flight check (Discord API)...', 'System');
        try {
            const res = await fetch('https://discord.com/api/v10/gateway/bot', {
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
            });
            if (res.ok) {
                logger.info('[HTTP] Discord API Pre-flight Check: SUCCESS (IPv4 Forced)', 'System');
            } else {
                logger.warn(`[HTTP] Discord API Pre-flight Check: RETURNED ${res.status} ${res.statusText}`, 'System');
            }
        } catch (fetchErr) {
            logger.error('[HTTP] Discord API Pre-flight Check: FAILED (Hanged/Blocked)', fetchErr, 'System');
        }

        logger.info(`Starting Production Environment...`, 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        logger.info('Initiating Handshake with Discord Gateway...', 'System');
        await client.login(process.env.DISCORD_TOKEN);

        // --- Graceful Shutdown Sequence ---
        const handleShutdown = async (signal) => {
            logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
            
            // 1. Close Health Server
            if (server.listening) {
                server.close(() => logger.info('[ShutDown] HTTP archives locked and secured.', 'System'));
            }

            // 2. Destroy Discord Session (Logs out cleanly)
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

// Pulse
setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
    logger.info(`Pulse: OK (Heap: ${heapUsed}MB)`, 'System');
}, 60000);
