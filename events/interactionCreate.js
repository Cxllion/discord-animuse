const { Events } = require('discord.js');
const { routeInteraction } = require('../utils/handlers/router');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 0. Startup Gate
        if (!interaction.client.isSystemsGo) {
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '⏳ **The Library is Opening**: Please wait a moment while we organize the archives...', flags: 64 });
                }
            } catch (e) { }
            return;
        }

        // 1. Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                const isUnknownInteraction = error.code === 10062 || error.code === 40060 ||
                    error.rawError?.code === 10062 || error.rawError?.code === 40060 ||
                    (error.message && error.message.toLowerCase().includes('unknown interaction'));

                if (isUnknownInteraction) return;

                logger.error(`Error executing command ${interaction.commandName}:`, error, 'Interaction');

                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: 'There was an error executing this command!', flags: 64 });
                    } else {
                        await interaction.reply({ content: 'There was an error executing this command!', flags: 64 });
                    }
                } catch (e) {
                    // Ignore follow-up errors
                }
            }
        }
        // 2. Autocomplete
        else if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.autocomplete(interaction);
            } catch (err) {
                logger.error(`Autocomplete error in ${interaction.commandName}:`, err, 'Interaction');
            }
        }
        // 3. Components (Routed)
        else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            try {
                const handled = await routeInteraction(interaction);
                if (!handled) {
                    // Optional: Log unhandled interaction or ignore
                    // logger.debug(`Unhandled interaction: ${interaction.customId}`, 'Interaction');
                }
            } catch (error) {
                const isUnknownInteraction = error.code === 10062 || error.code === 40060 ||
                    error.rawError?.code === 10062 || error.rawError?.code === 40060 ||
                    (error.message && error.message.toLowerCase().includes('unknown interaction'));

                if (isUnknownInteraction) return;

                logger.error('Interaction handling error:', error, 'Interaction');

                try {
                    const payload = { content: '❌ An error occurred while processing this request.', flags: 64 };
                    if (interaction.isRepliable()) {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply(payload);
                        } else {
                            await interaction.followUp(payload);
                        }
                    }
                } catch (e) { }
            }
        }
    },
};
