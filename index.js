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

// Load Custom Custom Fonts (for Render consistency)
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

// Validate Environment Variables
const { validateEnv } = require('./utils/core/envManager');
validateEnv();

// Create simple HTTP server for Render health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    // Zero-latency response for Render's internal proxy
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Connection': 'close' // Prevent socket lingering
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

// Internal Pulse: Heartbeat log every 30 seconds to prove the process is healthy
setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
    logger.info(`Internal Pulse: Event Loop is ALIVE (Heap: ${heapUsed}MB)`, 'System');
}, 30000);

// Start Bot with "Bulletproof" Instant-Up Strategy
(async () => {
    try {
        logger.info('--- Library Opening Sequence Started ---', 'Startup');
        
        // Step 1: Load Core Resources (Commands, Events) - Must happen before login
        loadCoreResources(client);

        // Step 2: Non-Blocking Discord Login
        // We REMOVE the 'await' here. This allows the script to reach its idle state instantly,
        // which satisfies Render's health checks even if Discord's gateway is hanging.
        logger.info('Initiating Handshake with Discord Gateway (Non-Blocking)...', 'Startup');
        client.login(process.env.DISCORD_TOKEN).catch(err => {
            logger.error('Discord Login Rejected:', err, 'Handshake');
        });
        
        // Step 3: Background Initialization (Database, Schedulers)
        // This continues in parallel to the Discord handshake.
        initializeDatabase(client);

    } catch (err) {
        logger.error('Critical Startup Failure:', err, 'Startup');
        setTimeout(() => process.exit(1), 1000);
    }
})();
