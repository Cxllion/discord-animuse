const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');
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

    // --- 1. LOCAL ESCAPE HATCH ---
    // IDs starting with 'local_' are reserved for command-specific collectors.
    // We return true to signal the global listener to stay silent.
    if (customId.startsWith('local_')) return true;

    try {
        // --- 2. GLOBAL HANDLERS ---
        if (customId === 'leaderboard_minigames') {
            try {
                const leaderboardCommand = require('../../commands/social/leaderboard');
                
                // Safe Mocking of options
                const mockOptions = {
                    getString: (name) => (name === 'type' ? 'arcade' : null),
                    getInteger: () => null,
                    getUser: () => null,
                    getMember: () => null
                };

                // Use Object.defineProperty to bypass immutability if it exists
                Object.defineProperty(interaction, 'options', {
                    value: mockOptions,
                    writable: true,
                    configurable: true
                });

                return await leaderboardCommand.execute(interaction);
            } catch (err) {
                logger.error('[Router] Global Leaderboard failure:', err);
                return interaction.reply({ content: '❌ **Archive Error:** Failed to synchronize the Arcade leaderboards.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }

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
