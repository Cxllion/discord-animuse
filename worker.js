require('dotenv').config();
const { checkAiringAnime } = require('./utils/services/scheduler');
const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('./utils/core/logger');

// This is a minimal client exclusively for sending schedule updates.
// It does not sync commands or register full interaction events.
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

client.once('ready', async () => {
    logger.info(`Polling Worker Process Online. Logged in as ${client.user.tag}`, 'Worker');
    
    try {
        await checkAiringAnime(client);
        logger.info('Polling cycle complete.', 'Worker');
    } catch (err) {
        logger.error('Worker polling failed:', err, 'Worker');
    }
    
    // Once finished, destroy the client and gracefully exit.
    // Crons can run this file directly every 10 minutes.
    client.destroy();
    process.exit(0);
});

// Kick off
const token = process.env.DISCORD_TOKEN;
if (!token) {
    logger.error('Missing DISCORD_TOKEN in environment.', null, 'Worker');
    process.exit(1);
}

client.login(token);
