const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * @typedef {Object} CommandModule
 * @property {import('discord.js').SlashCommandBuilder} data
 * @property {function(import('discord.js').ChatInputCommandInteraction): Promise<void>} execute
 * @property {function(import('discord.js').AutocompleteInteraction): Promise<void>} [autocomplete]
 * @property {number} [cooldown]
 * @property {string[]} [botPermissions]
 * @property {string[]} [userPermissions]
 * @property {boolean} [dbRequired]
 * @property {boolean} [ephemeral]
 */

/**
 * Loads all commands from the commands directory recursively.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
const loadCommands = (client) => {
    const foldersPath = path.join(__dirname, '../../commands');
    
    if (!fs.existsSync(foldersPath)) {
        logger.error(`Commands directory not found at: ${foldersPath}`, 'Loader');
        return;
    }

    const commandFolders = fs.readdirSync(foldersPath, { withFileTypes: true });
    let totalLoaded = 0;

    const CONFIG = require('../config');
    const botType = CONFIG.BOT_TYPE || 'main';
    let filteredFolders = commandFolders;

    if (botType === 'main') {
        const allowedMain = ['search', 'anime', 'social', 'minigames', 'fun', 'general', 'moderation'];
        filteredFolders = commandFolders.filter(folder => allowedMain.includes(folder.name));
    } else if (botType === 'core') {
        const allowedCore = ['configuration', 'admin', 'utility', 'system'];
        filteredFolders = commandFolders.filter(folder => allowedCore.includes(folder.name));
    }

    for (const folder of filteredFolders) {
        if (!folder.isDirectory()) continue;

        const commandsPath = path.join(foldersPath, folder.name);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const command = require(filePath);
                
                if ('data' in command && 'execute' in command) {
                    command.category = folder.name;
                    client.commands.set(command.data.name, command);
                    logger.debug(`Loaded command: ${command.data.name} in category ${folder.name}`, 'Loader');
                    totalLoaded++;
                } else {
                    logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`, 'Loader');
                }
            } catch (e) {
                logger.error(`Failed to load command ${file} from ${folder.name}:`, e, 'Loader');
            }
        }
    }
    
    logger.info(`Successfully curated ${totalLoaded} command volumes across ${commandFolders.filter(f => f.isDirectory()).length} categories.`, 'Loader');
};

/**
 * Loads all events from the events directory.
 * @param {Client} client The Discord client instance.
 */
const loadEvents = (client) => {
    const eventsPath = path.join(__dirname, '../../events');
    
    if (!fs.existsSync(eventsPath)) {
        logger.error(`Events directory not found at: ${eventsPath}`, 'Loader');
        return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    let totalLoaded = 0;

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const event = require(filePath);
            const eventName = event.name || path.basename(file, '.js');
            
            if (event.once) {
                client.once(eventName, (...args) => event.execute(...args));
            } else {
                client.on(eventName, (...args) => event.execute(...args));
            }
            logger.debug(`Loaded event: ${eventName}`, 'Loader');
            totalLoaded++;
        } catch (e) {
            logger.error(`Failed to load event ${file}:`, e, 'Loader');
        }
    }
    
    logger.info(`Successfully bound ${totalLoaded} runtime events.`, 'Loader');
};

module.exports = { loadCommands, loadEvents };

