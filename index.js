const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();

const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { loadCoreResources, initializeDatabase } = require('./utils/core/init');
const logger = require('./utils/core/logger');

// ==========================================
// PRODUCTION BOT INSTANCE (Oracle VPS)
// Status: Mission Successful - 24/7 Active
// GitHub Auto-Deploy: ENABLED 🟢
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
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = false;

// Setup Client Safety
setupClientHandlers(client);

(async () => {
    try {
        logger.info(`Starting Production Environment on Oracle VPS...`, 'System');
        
        loadCoreResources(client);
        await initializeDatabase(client);
        
        logger.info('Initiating Handshake with Discord Gateway...', 'System');
        await client.login(process.env.DISCORD_TOKEN);

        // --- Graceful Shutdown Sequence ---
        const handleShutdown = async (signal) => {
            logger.info(`[ShutDown] Signal ${signal} received. Closing the Grand Library Archives... ♡`, 'System');
            
            // Destroy Discord Session (Logs out cleanly)
            client.destroy();
            logger.info('[ShutDown] Discord archivist connection terminated.', 'System');

            // Exit process (Wait briefly for logs)
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

