const { Events, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { routeInteraction } = require('../utils/handlers/router');
const logger = require('../utils/core/logger');
const cooldownManager = require('../utils/core/cooldownManager');
const statusManager = require('../utils/core/statusManager');
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
        // 0. Maintenance Mode & Startup Gate
        const isOwner = interaction.client.application?.owner?.id === interaction.user.id;
        const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
        
        // If maintenance is on and user is NOT owner/admin, block interaction with themed message
        if (statusManager.isMaintenance() && !isOwner && !isAdmin) {
            try {
                if (interaction.isRepliable()) {
                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            embeds: [statusManager.createMaintenanceEmbed()],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            } catch (e) {
                logger.error('Error replying for maintenance mode:', e, 'Interaction');
            }
            return;
        }

        // 0.1 Startup Gate (Client not fully ready)
        if (!interaction.client.isSystemsGo) {
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        embeds: [statusManager.createStartupEmbed()],
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (e) { }
            return;
        }

        // 0.2 Test Bot Access Control (Restrict usage to admins/testers)
        if (interaction.client.isTestBot) {
            const testerRoleId = process.env.TESTER_ROLE_ID;
            const isTester = testerRoleId ? interaction.member?.roles.cache.has(testerRoleId) : false;

            if (!isAdmin && !isOwner && !isTester) {
                try {
                    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            embeds: [statusManager.createMaintenanceEmbed()
                                .setTitle('🚫 **Access Restricted**')
                                .setDescription('This is a **Test Instance** of the library. Access is restricted to Librarians and Beta Readers.')
                            ],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (e) { }
                return;
            }
        }



        // 1. Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                // Check Offline Mode for DB-reliant commands
                if (interaction.client.isOfflineMode && command.dbRequired !== false) {
                    return await interaction.reply({
                        embeds: [statusManager.createMaintenanceEmbed().setDescription('⚠️ **The Library is currently sealed.** (Database Offline)\nCommands requiring library records cannot be executed at this time.')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // 1a. Check cooldowns
                const cooldown = command.cooldown || 3; // Default 3 seconds
                if (!cooldownManager.check(interaction.user.id, interaction.commandName, cooldown, isOwner)) {
                    const remaining = cooldownManager.getRemainingTime(interaction.user.id, interaction.commandName);
                    return await interaction.reply({
                        embeds: [createCooldownEmbed(remaining, interaction.commandName)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // 1b. Check bot permissions
                if (command.botPermissions && command.botPermissions.length > 0) {
                    const permCheck = await checkBotPermissions(interaction, command.botPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createBotPermissionEmbed(permCheck.missing)],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                // 1c. Check user permissions
                if (command.userPermissions && command.userPermissions.length > 0) {
                    const permCheck = await checkUserPermissions(interaction, command.userPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createUserPermissionEmbed(permCheck.missing)],
                            flags: MessageFlags.Ephemeral
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
                }
            } catch (error) {
                const isUnknownInteraction = error.code === 10062 || error.code === 40060 ||
                    error.rawError?.code === 10062 || error.rawError?.code === 40060 ||
                    (error.message && error.message.toLowerCase().includes('unknown interaction'));

                if (isUnknownInteraction) return;

                logger.error('Interaction handling error:', error, 'Interaction');

                try {
                    const payload = { content: '❌ An error occurred while processing this request.', flags: MessageFlags.Ephemeral };
                    if (interaction.isRepliable()) {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply(payload).catch(() => {});
                        } else {
                            await interaction.followUp(payload).catch(() => {});
                        }
                    }
                } catch (e) { }
            }
        }
    },
};

