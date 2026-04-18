const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();

const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const fs = require('fs');
const path = require('path');
const mafiaService = require('./utils/services/mafiaService');

// ==========================================
// PRODUCTION BOT INSTANCE (Oracle VPS)
// Status: Mission Successful - 24/7 Active
// GitHub Auto-Deploy: ENABLED 🟢
// ==========================================

const http = require('http');

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
    shards: 'auto'
});

// Sharding Metadata
client.shardId = client.shard ? client.shard.ids[0] : 0;
client.shardCount = client.shard ? client.shard.count : 1;
logger.debug(`[System] Initializing Shard #${client.shardId}/${client.shardCount}...`, 'System');

client.commands = new Collection();
client.intervals = []; 
client.isSystemsGo = false;
client.isTestBot = process.env.TEST_MODE === 'true';

if (client.isTestBot) {
    logger.debug('[System] Test Mode Detected. Background schedulers will be DISABLED. ♡', 'System');
}

// Setup Client Safety
setupClientHandlers(client);

// --- Optional Health-Check Server (For Oracle Monitoring) ---
const PORT = process.env.PORT || null;
if (PORT) {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Animuse Archives: Systems Operational ♡');
    });
    server.listen(PORT, () => {
        logger.debug(`[Networking] Health-Check Server Operational on Port ${PORT}.`, 'System');
    });
} else {
    logger.debug('[Networking] Health-Check Server is DISABLED (Optional).', 'System');
}

(async () => {
    try {
        const envName = client.isTestBot ? 'Test Environment' : 'Production Environment on Oracle VPS';
        logger.debug(`Starting ${envName}...`, 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        logger.debug('Initiating Handshake with Discord Gateway...', 'System');
        await client.login(process.env.DISCORD_TOKEN);

        // --- Graceful Shutdown Sequence ---
        const handleShutdown = async (signal) => {
            logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
            
            // 0. Gracefully archive Mafia sessions
            try {
                const MafiaManager = require('./utils/mafia/MafiaManager');
                await MafiaManager.shutdown();
            } catch (e) {
                logger.error('[ShutDown] Failed to archive Mafia sessions:', e, 'System');
            }

            // 1. Clear Active Intervals
            if (client.intervals) {
                client.intervals.forEach(clearInterval);
                logger.info(`[ShutDown] Terminated ${client.intervals.length} background tasks.`, 'System');
            }
            
            // 2. Destroy Discord Session (Logs out cleanly)
            client.destroy();
            logger.info('[ShutDown] Discord archivist connection terminated.', 'System');

            // Exit process (Wait briefly for logs)
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        };

        process.on('SIGINT', () => handleShutdown('SIGINT'));
        process.on('SIGTERM', () => handleShutdown('SIGTERM'));

        // --- Memory Pulse (tracked for graceful shutdown) ---
        client.intervals.push(setInterval(() => {
            const memory = process.memoryUsage();
            const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);
            logger.info(`Pulse: OK (Heap: ${heapUsed}MB)`, 'System');
        }, 60000));

    } catch (error) {
        logger.error('Startup Critical Failure:', error, 'System');
        process.exit(1);
    }
})();
