const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const logger = require('./logger');

const HASH_FILE = path.join(__dirname, '../../.deploy_hash');

/**
 * Calculates a hash of the current commands.
 * @param {Array} commands 
 * @returns {string}
 */
const calculateHash = (commands) => {
    return crypto.createHash('md5').update(JSON.stringify(commands)).digest('hex');
};

/**
 * Deploys commands to all guilds the client is in.
 * @param {object} client 
 */
const deployCommands = async (client) => {
    const commands = [];
    const foldersPath = path.join(__dirname, '../../commands');
    const commandFolders = fs.readdirSync(foldersPath);

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
        logger.info('The library index is up to date.', 'CommandDeployer');
        return;
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {

        logger.info(`Syncing ${commands.length} commands with Discord API...`, 'CommandDeployer');

        // Clear Global Commands (to prevent duplicates if switching from global to guild)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] },
        );
        logger.debug('Global commands cleared.', 'CommandDeployer');

        // Deploy to ALL guilds (Parallel for performance)
        const guilds = client.guilds.cache.map(guild => guild.id);
        
        await Promise.all(guilds.map(guildId => 
            rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands },
            )
        ));

        fs.writeFileSync(HASH_FILE, currentHash);

        logger.info('The library index has been successfully synchronized. ♡', 'CommandDeployer');

    } catch (error) {
        logger.error('Deploy Commands Error', error, 'CommandDeployer');
    }
}

module.exports = { deployCommands };
