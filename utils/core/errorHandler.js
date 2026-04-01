const logger = require('./logger');
const baseEmbed = require('../generators/baseEmbed');
const CONFIG = require('../config');
const { formatPermission, getPermissionSuggestion } = require('./permissionChecker');
const { fetchConfig } = require('./database');

/**
 * Error Handler for AniMuse
 * Creates library-themed error messages for consistent UX
 */

// Color scheme for different error types
const COLORS = {
    ERROR: '#FF6B6B',         // Red for errors
    WARNING: '#FFD93D',       // Yellow for warnings
    COOLDOWN: '#FFA500',      // Orange for cooldowns
    PERMISSION: '#9B59B6',    // Purple for permission errors
    INFO: '#FFACD1',          // Pink for info
    SUCCESS: '#6BCF7A'        // Green for success
};

/**
 * Create a themed error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {string} color - Hex color code
 * @param {Object} options - Additional options (footer, fields, etc.)
 * @returns {EmbedBuilder}
 */
const createErrorEmbed = (title, description, color = CONFIG.COLORS.ERROR, options = {}) => {
    const embed = baseEmbed(title, description)
        .setColor(color);

    if (options.fields) {
        embed.addFields(options.fields);
    }

    return embed;
};

/**
 * Create cooldown error embed
 * @param {number} seconds - Seconds remaining
 * @param {string} commandName - Command name
 * @returns {EmbedBuilder}
 */
const createCooldownEmbed = (seconds, commandName = '') => {
    const timeText = seconds === 1 ? '1 second' : `${seconds} seconds`;

    return createErrorEmbed(
        '📚 Please Wait!',
        `You're browsing the archives too quickly.\n\nTry **${commandName ? `\`/${commandName}\`` : 'this command'}** again in **${timeText}**.`,
        CONFIG.COLORS.WARNING
    );
};

/**
 * Create permission error embed (bot missing permissions)
 * @param {string[]} missing - Array of missing permission names
 * @returns {EmbedBuilder}
 */
const createBotPermissionEmbed = (missing) => {
    const formatted = missing.map(p => `• ${formatPermission(p)}`).join('\n');
    const suggestion = getPermissionSuggestion(missing);

    return createErrorEmbed(
        '🔒 Missing Permissions',
        `I need the following permissions to do that:\n\n${formatted}${suggestion}`,
        CONFIG.COLORS.ERROR
    );
};

/**
 * Create permission error embed (user missing permissions)
 * @param {string[]} missing - Array of missing permission names
 * @param {string} requiredRole - Optional required role name
 * @returns {EmbedBuilder}
 */
const createUserPermissionEmbed = (missing, requiredRole = null) => {
    let description;

    if (requiredRole) {
        description = `This section of the library is restricted to staff.\n\n**Required role**: ${requiredRole}`;
    } else {
        const formatted = missing.map(p => `• ${formatPermission(p)}`).join('\n');
        description = `You need the following permissions to use this command:\n\n${formatted}`;
    }

    return createErrorEmbed(
        '🚫 Access Denied',
        description,
        CONFIG.COLORS.ERROR
    );
};

/**
 * Create database error embed
 * @param {boolean} critical - Whether error is critical
 * @returns {EmbedBuilder}
 */
const createDatabaseErrorEmbed = (critical = false) => {
    const description = critical
        ? 'A critical error occurred while accessing the library\'s records.\n\nPlease contact support if this persists.'
        : 'The library\'s records are temporarily being reorganized.\n\nPlease try again in a moment.';

    return createErrorEmbed(
        '📚 Archives Temporarily Unavailable',
        description,
        CONFIG.COLORS.WARNING
    );
};

/**
 * Create general error embed
 * @param {string} message - Custom error message
 * @param {string} errorCode - Optional error code
 * @returns {EmbedBuilder}
 */
const createGeneralErrorEmbed = (message = null, errorCode = null) => {
    const defaultMessage = 'An unexpected error occurred while processing your request.';
    const description = message || defaultMessage;

    return createErrorEmbed(
        '❌ Something Went Wrong',
        errorCode ? `${description}\n\n**Error Code**: \`${errorCode}\`` : description,
        CONFIG.COLORS.ERROR
    );
};

/**
 * Create not found error embed
 * @param {string} itemType - Type of item not found (e.g., 'anime', 'user', 'card')
 * @returns {EmbedBuilder}
 */
const createNotFoundEmbed = (itemType = 'item') => {
    return createErrorEmbed(
        '📖 Not Found',
        `That ${itemType} doesn't exist in our catalog.\n\nPlease check your input and try again.`,
        CONFIG.COLORS.WARNING
    );
};

/**
 * Handle command errors globally
 * @param {Interaction} interaction - Discord interaction
 * @param {Error} error - Error object
 * @param {string} commandName - Command name
 */
const handleCommandError = async (interaction, error, commandName) => {
    logger.error(`Error in command ${commandName}:`, error, 'ErrorHandler');

    let embed;

    // Categorize error types
    if (error.message && error.message.includes('Missing Permissions')) {
        embed = createBotPermissionEmbed(['SendMessages', 'EmbedLinks']);
    } else if (error.message && error.message.includes('database')) {
        embed = createDatabaseErrorEmbed(false);
    } else if (error.code === 50013) {
        // Discord permission error
        embed = createBotPermissionEmbed(['ManageRoles', 'ManageChannels']);
    } else {
        // General error
        const errorCode = `ERR_${commandName.toUpperCase()}_${Date.now().toString().slice(-6)}`;
        embed = createGeneralErrorEmbed(null, errorCode);
    }

    // Try to send error message to user
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (followUpError) {
        logger.error('Could not send error message:', followUpError, 'ErrorHandler');
    }

    // --- AUTOMATED GUILD LOGGING ---
    if (interaction.guild) {
        try {
            const config = await fetchConfig(interaction.guild.id);
            if (config?.logs_channel_id) {
                const reportEmbed = baseEmbed('📋 Library Incident Report', 'An error occurred while processing a command.')
                    .addFields(
                        { name: 'Command', value: `\`/${commandName}\``, inline: true },
                        { name: 'User', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                        { name: 'Error', value: `\`\`\`js\n${error.message || 'No message'}\n\`\`\``, inline: false }
                    )
                    .setColor(CONFIG.COLORS.ERROR);

                // Get the error code from the user embed if it exists
                const userEmbed = embed.data;
                if (userEmbed.description?.includes('Error Code')) {
                    const code = userEmbed.description.split('`').slice(-2, -1)[0];
                    reportEmbed.addFields({ name: 'Error Code', value: `\`${code}\``, inline: true });
                }

                await logger.reportToGuild(interaction.guild, config.logs_channel_id, reportEmbed);
            }
        } catch (e) {
            // Silently ignore logging failures
        }
    }
};

/**
 * General Error Handler for Interactions (Buttons, Selects, Modals)
 * Similar to handleCommandError but for non-command interactions
 * @param {Interaction} interaction 
 * @param {Error} error 
 * @param {string} customMessage Optional custom message
 */
const handleInteractionError = async (interaction, error, customMessage = null) => {
    logger.error('Interaction Error:', error, 'ErrorHandler');

    const embed = createGeneralErrorEmbed(customMessage || 'An error occurred while processing this interaction.');

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (e) {
        logger.error('Failed to send interaction error message:', e, 'ErrorHandler');
    }

    // --- AUTOMATED GUILD LOGGING ---
    if (interaction.guild) {
        try {
            const config = await fetchConfig(interaction.guild.id);
            if (config?.logs_channel_id) {
                const reportEmbed = new EmbedBuilder()
                    .setTitle('📋 Interaction Incident Report')
                    .setDescription(`An error occurred while processing an interaction.`)
                    .addFields(
                        { name: 'Custom ID', value: `\`${interaction.customId || 'Unknown'}\``, inline: true },
                        { name: 'Type', value: interaction.type.toString(), inline: true },
                        { name: 'User', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                        { name: 'Error', value: `\`\`\`js\n${error.message || 'No message'}\n\`\`\``, inline: false }
                    )
                    .setColor(COLORS.ERROR)
                    .setTimestamp();

                await logger.reportToGuild(interaction.guild, config.logs_channel_id, reportEmbed);
            }
        } catch (e) {
            // Silently ignore
        }
    }
};

/**
 * Checks if an error is a safe-to-ignore Unknown Interaction error
 * @param {Error} error 
 * @returns {boolean}
 */
const isUnknownInteraction = (error) => {
    if (!error) return false;
    return error.code === 10062 || error.code === 40060 ||
        error.rawError?.code === 10062 || error.rawError?.code === 40060 ||
        (error.message && error.message.toLowerCase().includes('unknown interaction'));
};

module.exports = {
    createErrorEmbed,
    createCooldownEmbed,
    createBotPermissionEmbed,
    createUserPermissionEmbed,
    createDatabaseErrorEmbed,
    createGeneralErrorEmbed,
    createNotFoundEmbed,
    handleCommandError,
    handleInteractionError,
    isUnknownInteraction,
    COLORS
};
