const { Events } = require('discord.js');
const { routeInteraction } = require('../utils/handlers/router');
const logger = require('../utils/core/logger');
const cooldownManager = require('../utils/core/cooldownManager');
const { checkBotPermissions, checkUserPermissions } = require('../utils/core/permissionChecker');
const {
    createCooldownEmbed,
    createBotPermissionEmbed,
    createUserPermissionEmbed,
    handleCommandError
} = require('../utils/core/errorHandler');

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
                // Check if user is owner (for cooldown bypass)
                const isOwner = interaction.client.application?.owner?.id === interaction.user.id;

                // 1a. Check cooldowns
                const cooldown = command.cooldown || 3; // Default 3 seconds
                if (!cooldownManager.check(interaction.user.id, interaction.commandName, cooldown, isOwner)) {
                    const remaining = cooldownManager.getRemainingTime(interaction.user.id, interaction.commandName);
                    return await interaction.reply({
                        embeds: [createCooldownEmbed(remaining, interaction.commandName)],
                        ephemeral: true
                    });
                }

                // 1b. Check bot permissions
                if (command.botPermissions && command.botPermissions.length > 0) {
                    const permCheck = await checkBotPermissions(interaction, command.botPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createBotPermissionEmbed(permCheck.missing)],
                            ephemeral: true
                        });
                    }
                }

                // 1c. Check user permissions
                if (command.userPermissions && command.userPermissions.length > 0) {
                    const permCheck = await checkUserPermissions(interaction, command.userPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createUserPermissionEmbed(permCheck.missing)],
                            ephemeral: true
                        });
                    }
                }

                // 1d. Set cooldown (after all checks pass)
                cooldownManager.set(interaction.user.id, interaction.commandName, cooldown);

                // 1e. Execute command
                await command.execute(interaction);

            } catch (error) {
                const isUnknownInteraction = error.code === 10062 || error.code === 40060 ||
                    error.rawError?.code === 10062 || error.rawError?.code === 40060 ||
                    (error.message && error.message.toLowerCase().includes('unknown interaction'));

                if (isUnknownInteraction) return;

                // Use themed error handler
                await handleCommandError(interaction, error, interaction.commandName);
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
