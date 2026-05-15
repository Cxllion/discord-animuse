const { Events, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { routeInteraction } = require('../utils/handlers/router');
const logger = require('../utils/core/logger');
const CONFIG = require('../utils/config');
const cooldownManager = require('../utils/core/cooldownManager');
const statusManager = require('../utils/core/statusManager');
const { checkBotPermissions, checkUserPermissions } = require('../utils/core/permissionChecker');
const {
    createCooldownEmbed,
    createBotPermissionEmbed,
    createUserPermissionEmbed,
    handleCommandError,
    handleInteractionError,
    isUnknownInteraction
} = require('../utils/core/errorHandler');
const crypto = require('crypto');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- 1. Interaction Metadata (V2 Tracing) ---
        const requestId = crypto.randomUUID();
        interaction.requestId = requestId;

        // --- 2. Maintenance Mode & Startup Gate ---
        const appOwner = interaction.client.application?.owner;
        const isOwner = appOwner?.members 
            ? appOwner.members.has(interaction.user.id) 
            : appOwner?.id === interaction.user.id;
        const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) || false;
        
        // Maintenance Block
        if (statusManager.isMaintenance() && !isOwner) {
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    return await interaction.reply({
                        embeds: [statusManager.createMaintenanceEmbed()],
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (e) {
                logger.error('Maintenance reply failed', e, 'Interaction');
            }
            return;
        }

        // Startup Gate
        if (!interaction.client.isSystemsGo) {
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        embeds: [statusManager.createStartupEmbed()],
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (e) { 
                logger.debug(`Startup gate reply failed: ${e.message}`, 'Interaction');
            }
            return;
        }

        // Test Bot Access Control
        if (interaction.client.isTestBot) {
            let isTester = false;
            
            if (interaction.inGuild()) {
                const testerRoleId = CONFIG.TESTER_ROLE_ID;
                isTester = testerRoleId ? interaction.member?.roles.cache.has(testerRoleId) : false;
            } 
            
            if (
                interaction.customId?.startsWith('archive_') || 
                interaction.customId?.startsWith('mafia_') ||
                interaction.customId?.startsWith('c4_') ||
                interaction.customId?.startsWith('t4_') ||
                interaction.customId?.startsWith('t3_') ||
                interaction.customId?.startsWith('t3t_')
            ) {
                isTester = true;
            }

            if (!isAdmin && !isOwner && !isTester) {
                try {
                    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            embeds: [statusManager.createMaintenanceEmbed()
                                .setTitle('🚫 Entry Restricted')
                                .setDescription('I\'m sorry, Reader, but this is a **Test Instance** of the library archives.\n\nAccess is currently restricted to Senior Archivists and Beta Readers while we reorganize the shelves. ♡')
                            ],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (e) { 
                    logger.debug(`Test bot restriction failed: ${e.message}`, 'Interaction');
                }
                return;
            }
        }

        // --- 3. Interaction Routing ---
        
        // A. Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                // DB Check for Offline Mode
                if (interaction.client.isOfflineMode && command.dbRequired !== false) {
                    return await interaction.reply({
                        embeds: [statusManager.createMaintenanceEmbed()
                            .setTitle('🗄️ Archives Temporarily Sealed')
                            .setDescription('I\'m terribly sorry, but the **library database is currently unreachable.**\n\nCommands requiring access to our server records cannot be used until the ink has dried on our system synchronization. ♡')
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Cooldowns
                const cooldown = command.cooldown || 3;
                if (!(await cooldownManager.check(interaction.user.id, interaction.commandName, cooldown, isOwner))) {
                    const remaining = cooldownManager.getRemainingTime(interaction.user.id, interaction.commandName);
                    return await interaction.reply({
                        embeds: [createCooldownEmbed(remaining, interaction.commandName)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Bot Permissions
                if (command.botPermissions?.length > 0) {
                    const permCheck = await checkBotPermissions(interaction, command.botPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createBotPermissionEmbed(permCheck.missing)],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                // User Permissions
                if (command.userPermissions?.length > 0) {
                    const permCheck = await checkUserPermissions(interaction, command.userPermissions);
                    if (!permCheck.success) {
                        return await interaction.reply({
                            embeds: [createUserPermissionEmbed(permCheck.missing)],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                await cooldownManager.set(interaction.user.id, interaction.commandName, cooldown);
                
                // --- Auto-Defer Pipeline ---
                let isHandled = false;
                const isEphemeral = command.ephemeral ?? false;
                const deferTimer = setTimeout(async () => {
                    if (!isHandled && !interaction.replied && !interaction.deferred) {
                        try {
                            await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : undefined });
                        } catch (e) {}
                    }
                }, 2500);

                // Execute
                try {
                    await command.execute(interaction);
                } finally {
                    isHandled = true;
                    clearTimeout(deferTimer);
                }

            } catch (error) {
                if (isUnknownInteraction(error)) return;
                await handleCommandError(interaction, error, interaction.commandName);
            }
        }
        
        // B. Autocomplete
        else if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.autocomplete(interaction);
            } catch (err) {
                logger.error(`Autocomplete error: ${interaction.commandName}`, err, 'Interaction');
            }
        }
        
        // C. Components & Modals
        else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            try {
                const handled = await routeInteraction(interaction);
                if (!handled) {
                    logger.warn(`Unrouted: ${interaction.customId}`, 'Interaction');
                    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '⏳ This interaction has expired or is no longer available.',
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }
                }
            } catch (error) {
                if (isUnknownInteraction(error)) return;
                await handleInteractionError(interaction, error);
            }
        }
    },
};
