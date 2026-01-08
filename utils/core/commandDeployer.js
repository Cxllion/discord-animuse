const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
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
        console.log('The library index is up to date.');
        return;
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Clear Global Commands (to prevent duplicates if switching from global to guild)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] },
        );
        console.log('Global commands cleared.');

        // Deploy to ALL guilds
        const guilds = client.guilds.cache.map(guild => guild.id);

        for (const guildId of guilds) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands },
            );
        }

        fs.writeFileSync(HASH_FILE, currentHash);
        console.log('The library index has been synchronized with the main hall. ♡');

    } catch (error) {
        console.error(error);
    }
};

module.exports = { deployCommands };
