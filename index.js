const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');
const dns = require('dns');

// 🛡️ [DNS] Re-enable IPv4 preference (Matches earlier Render fix)
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// 1. Core Safety Setup
setupProcessHandlers();

// 2. Health Check Server (Immediate Priority)
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Connection': 'close' });
    res.write('AniMuse Library: ONLINE');
    res.end();
});

server.listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${PORT} (Render Health Check)`, 'System');
});

// 3. Client Instance
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
    rest: { timeout: 60000 }
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false;

// 4. Client Handlers
setupClientHandlers(client);

// ── 5. LAZY BOOT SEQUENCE ──────────────────────────────────────────────────
// This strategy fires login IMMEDIATELY to satisfy Render and Discord queues.
// Resources (DB, Fonts, Commands) are loaded AFTER the handshake completes.

client.once('ready', async () => {
    try {
        logger.info(`Ready! Logged in as ${client.user.tag}`, 'Startup');
        
        // Load Core Resources (Commands, Events)
        loadCoreResources(client);
        
        // Load Custom Fonts
        const { loadCustomFonts } = require('./utils/core/fonts');
        loadCustomFonts();

        // Initialize Database (Asynchronous/Slow)
        await initializeDatabase(client);
        
        client.isSystemsGo = true;
        logger.info('--- Library Opening Sequence Completed! ---', 'Startup');
    } catch (err) {
        logger.error('Lazy-Boot Initialization Failed:', err, 'Startup');
    }
});

// Watchdog: Log Handshake progress every 15s until Ready
const watchdog = setInterval(() => {
    if (client.isReady()) {
        clearInterval(watchdog);
    } else {
        logger.info('Handshake with Discord Gateway in progress...', 'Handshake');
    }
}, 15000);

// Fire LOGIN Immediately
(async () => {
    try {
        logger.info('Initiating Handshake with Discord Gateway (Lazy-Boot Mode)...', 'Startup');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        logger.error('Discord Login Rejected:', err, 'Startup');
        process.exit(1);
    }
})();

// ── 6. GRACEFUL SHUTDOWN ───────────────────────────────────────────────────
const handleShutdown = async (signal) => {
    logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
    if (server.listening) server.close();
    client.destroy();
    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Internal Pulse (Heap Monitoring)
setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
    logger.info(`Pulse: OK (Heap: ${heapUsed}MB)`, 'System');
}, 60000);
