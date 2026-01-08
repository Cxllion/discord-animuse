const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const loadCommands = (client) => {
    const foldersPath = path.join(__dirname, '../../commands');
    let commandFolders = [];

    try {
        commandFolders = fs.readdirSync(foldersPath);
    } catch (err) {
        logger.error("Could not read 'commands' directory:", err);
        return;
    }

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        // Ensure it's a directory
        if (fs.existsSync(commandsPath) && fs.statSync(commandsPath).isDirectory()) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        logger.info(`Loaded command: ${command.data.name}`, 'Loader');
                    } else {
                        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`, 'Loader');
                    }
                } catch (e) {
                    logger.error(`Failed to load command ${file}:`, e, 'Loader');
                }
            }
        }
    }
};

const loadEvents = (client) => {
    const eventsPath = path.join(__dirname, '../../events');
    let eventFiles = [];

    try {
        eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    } catch (err) {
        logger.error("Could not read 'events' directory:", err);
        return;
    }

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const event = require(filePath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
            logger.info(`Loaded event: ${event.name}`, 'Loader');
        } catch (e) {
            logger.error(`Failed to load event ${file}:`, e, 'Loader');
        }
    }
};

module.exports = { loadCommands, loadEvents };
