const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./utils/core/logger');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
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

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        logger.info(`Started refreshing ${commands.length} application (/) commands.`, 'CommandDeployer');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        logger.info(`Successfully reloaded ${commands.length} application (/) commands.`, 'CommandDeployer');
    } catch (error) {
        logger.error('Command Deploy Error', error, 'CommandDeployer');
    }
})();
