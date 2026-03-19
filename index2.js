const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { initializeBot } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// ==========================================
// TEST BOT INSTANCE (INDEX2.JS)
// ==========================================

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts
const { loadCustomFonts } = require('./utils/core/fonts');
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
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.isSystemsGo = false;
client.isTestBot = true;

// Setup Client Safety
setupClientHandlers(client);

// Basic HTTP server for satisfying platform health checks
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Animuse Test Library: ONLINE');
    res.end();
}).listen(port);

(async () => {
    try {
        logger.info(`Starting Test Environment (Port ${port})...`, 'System');
        
        await initializeBot(client);
        
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('Startup Critical Failure:', error, 'System');
        process.exit(1);
    }
})();
