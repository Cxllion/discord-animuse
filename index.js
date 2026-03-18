const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
const { setupProcessHandlers, setupClientHandlers } = require('./utils/core/processHandlers');
const { initializeBot } = require('./utils/core/init');
const logger = require('./utils/core/logger');
const http = require('http');

// Setup Process Safety
setupProcessHandlers();

// Load Custom Custom Fonts (for Render consistency)
const { loadCustomFonts } = require('./utils/core/fonts');
loadCustomFonts();

// Validate Required Environment Variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`, null, 'Startup');
    logger.error('Please check your .env file. See .env.example for reference.', null, 'Startup');
    process.exit(1);
}

// Validate Environment Variable Formats
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.match(/^postgres(ql)?:\/\//)) {
    logger.warn('DATABASE_URL should start with postgres:// or postgresql:// - please verify the connection string format', 'Startup');
}

if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.startsWith('https://')) {
    logger.warn('SUPABASE_URL should start with https:// - please verify the URL format', 'Startup');
}

// Check Optional but Recommended Variables
const optionalEnvVars = ['ANILIST_CLIENT_ID'];
optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        logger.warn(`${varName} not set. Some features may be limited.`, 'Startup');
    }
});

// Create simple HTTP server for Render health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            bot: 'AniMuse',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} is already in use. Health-check server could not start, but the bot will continue running.`, 'System');
    } else {
        logger.error(`HTTP server error:`, e, 'System');
    }
});

server.listen(PORT, () => {
    logger.info(`HTTP server listening on port ${PORT} (for Render health checks)`, 'System');
});

// Initialize Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Required for members.fetch() and member events
    ],
});

client.commands = new Collection();
client.isSystemsGo = false;

// Setup Client Safety
setupClientHandlers(client);

// Graceful Shutdown Handler (for production platforms like Render)
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, gracefully shutting down...', 'System');
    server.close();
    client.destroy();
    process.exit(0);
});

// Start Bot
initializeBot(client).then(() => {
    client.login(process.env.DISCORD_TOKEN);
}).catch(err => {
    logger.error('Critical Initialization Failure:', err, 'Startup');
    process.exit(1);
});
