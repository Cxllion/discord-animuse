const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');
const registry = require('./routerRegistry');
const { isUnknownInteraction } = require('../core/errorHandler');

/**
 * Automatically discovers and registers all interaction handlers in the directory.
 */
const initializeRouter = () => {
    const handlersPath = __dirname;
    const files = fs.readdirSync(handlersPath);

    logger.debug('Initializing Modular Interaction Router...', 'Router');

    for (const file of files) {
        // Skip self and non-handlers
        if (file === 'router.js' || file === 'routerRegistry.js' || !file.endsWith('.js')) continue;

        try {
            const handler = require(path.join(handlersPath, file));
            
            if (handler && handler.routerConfig) {
                registry.register(handler.routerConfig);
            }
        } catch (error) {
            logger.error(`Failed to load handler: ${file}`, error, 'Router');
        }
    }
    
    logger.debug(`Router initialization complete.`, 'Router');
};

// Run initialization immediately on load
initializeRouter();

/**
 * Routes active components to their specific handlers.
 * @param {import('discord.js').Interaction} interaction 
 */
const routeInteraction = async (interaction) => {
    const { customId } = interaction;
    if (!customId) return false;

    try {
        const handler = registry.findHandler(customId);

        if (handler) {
            await handler.handle(interaction);
            return true;
        }

        return false;
    } catch (error) {
        if (isUnknownInteraction(error)) return true;
        
        const { handleInteractionError } = require('../core/errorHandler');
        await handleInteractionError(interaction, error);
        return true;
    }
};

module.exports = { routeInteraction };
