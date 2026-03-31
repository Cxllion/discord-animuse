const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');
const dns = require('dns');

// Force IPv4 as preferred result for connection handshakes (solves Gateway hangs on some cloud providers)
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// Setup Process Safety
setupProcessHandlers();

// ── 1. IMMEDIATE HEALTH SERVER ──────────────────────────────────────────────
// This starts RIGHT AWAY to satisfy Render's health-check window (within 100ms)
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Connection': 'close' 
        });
        res.end(JSON.stringify({ status: 'online', uptime: Math.floor(process.uptime()) }));
        return;
    }
    res.writeHead(404);
    res.end();
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

// ── 2. BOT INITIALIZATION ───────────────────────────────────────────────────
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

// Load Custom Constants & Fonts
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

const { validateEnv } = require('./utils/core/envManager');
validateEnv();

// --- 3. ROBUST SEQUENTIAL BOOT SEQUENCE (Matches index2.js) ---
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'Startup');
        
        // Step 1: Load Core Resources (Sync)
        loadCoreResources(client);

        // Step 2: Initialize Database (Awaited - Prevents network race)
        await initializeDatabase(client);

        // Step 3: Discord Login (Awaited - Ensures events are fully bound)
        logger.info('Initiating Handshake with Discord Gateway...', 'Startup');
        await client.login(process.env.DISCORD_TOKEN);
        
    } catch (err) {
        logger.error('Critical Startup Failure:', err, 'Startup');
        setTimeout(() => process.exit(1), 1000);
    }
})();

// --- 4. GRACEFUL SHUTDOWN & CLEANUP (Matches index2.js) ---
const handleShutdown = async (signal) => {
    logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
    
    // 1. Close Health Server
    if (server.listening) {
        server.close(() => logger.info('[ShutDown] HTTP archives locked and secured.', 'System'));
    }

    // 2. Destroy Discord Session (Logs out cleanly)
    client.destroy();
    logger.info('[ShutDown] Discord archivist connection terminated.', 'System');

    // 3. Exit process (Wait briefly for logs to flush)
    setTimeout(() => {
        process.exit(0);
    }, 1000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Internal Pulse: Heartbeat log every 60 seconds (reduced churn)
setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
    logger.info(`Internal Pulse: Event Loop is ALIVE (Heap: ${heapUsed}MB)`, 'System');
}, 60000);
