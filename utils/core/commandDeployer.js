const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const CONFIG = require('../config');
const logger = require('./logger');

/**
 * Calculates a hash of the current commands.
 * @param {Array} commands 
 * @returns {string}
 */
const calculateHash = (commands) => {
    return crypto.createHash('md5').update(JSON.stringify(commands)).digest('hex');
};

const deployCommands = async (client) => {
    const commands = [];
    const foldersPath = path.join(__dirname, '../../commands');
    let commandFolders = fs.readdirSync(foldersPath);

    // Filter by BOT_TYPE
    const botType = CONFIG.BOT_TYPE || 'main';
    if (botType === 'main') {
        const allowedMain = ['search', 'anime', 'social', 'minigames', 'fun', 'general', 'moderation'];
        commandFolders = commandFolders.filter(folder => allowedMain.includes(folder));
    } else if (botType === 'core') {
        const allowedCore = ['configuration', 'admin', 'utility', 'system'];
        commandFolders = commandFolders.filter(folder => allowedCore.includes(folder));
    }

    const HASH_FILE = path.join(__dirname, `../../.deploy_hash_${botType}`);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        if (fs.statSync(commandsPath).isDirectory()) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                } else {
                    logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`, 'CommandDeployer');
                }
            }
        }
    }

    const currentHash = calculateHash(commands);
    let storedHash = '';
    if (fs.existsSync(HASH_FILE)) {
        storedHash = fs.readFileSync(HASH_FILE, 'utf-8');
    }

    if (process.env.DEPLOY_ON_START !== 'true' && currentHash === storedHash) {
        logger.debug('The library index is up to date.', 'CommandDeployer');
        return;
    }

    const rest = new REST().setToken(CONFIG.DISCORD_TOKEN);

    try {
        const clientId = CONFIG.CLIENT_ID;
        const guildId = process.env.GUILD_ID;

        logger.info(`Syncing ${commands.length} commands with Discord API...`, 'CommandDeployer');

        if (guildId) {
            // Instant deployment for development (Guild level)
            logger.info(`Deploying to Guild: ${guildId} (Instant Update)`, 'CommandDeployer');
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            
            // Optional: If we want to ensure NO duplicates, we should clear Global commands
            // But usually we just want to ensure Guild is up to date.
            // If the user sees duplicates, they might have old Global commands.
        } else {
            // Production deployment (Global level - can take up to 1 hour)
            logger.info('Deploying Global Commands (Propagation may take time)...', 'CommandDeployer');
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
        }

        fs.writeFileSync(HASH_FILE, currentHash);
        logger.info('The library index has been successfully synchronized. ♡', 'CommandDeployer');

    } catch (error) {
        logger.error('Deploy Commands Error', error, 'CommandDeployer');
    }
}

module.exports = { deployCommands };
