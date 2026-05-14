require('dotenv').config();
const { REST, Routes } = require('discord.js');

/**
 * Cleanup Script: Removes all global and guild commands for the current bot.
 * Use this if you are seeing duplicate commands in the slash menu.
 */
async function cleanup() {
    const token = process.env.DISCORD_TOKEN || process.env.TEST_DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID || process.env.TEST_CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!token || !clientId) {
        console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env');
        process.exit(1);
    }

    const rest = new REST().setToken(token);

    try {
        console.log('🧹 Initiating Command Cleanup...');

        // 1. Clear Global Commands
        console.log('-> Clearing Global Commands...');
        await rest.put(Routes.applicationCommands(clientId), { body: [] });

        // 2. Clear Guild Commands (if guild ID is known)
        if (guildId) {
            console.log(`-> Clearing Guild Commands for: ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        }

        console.log('✅ All commands cleared. Restart the bot to re-deploy fresh.');
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        process.exit(0);
    }
}

cleanup();
