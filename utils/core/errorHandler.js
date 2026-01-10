const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const { formatPermission, getPermissionSuggestion } = require('./permissionChecker');

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
const createErrorEmbed = (title, description, color = COLORS.ERROR, options = {}) => {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    if (options.footer) {
        embed.setFooter({ text: options.footer });
    }

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
        COLORS.COOLDOWN,
        {
            footer: 'Cooldowns help prevent spam and keep the bot responsive for everyone'
        }
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
        COLORS.PERMISSION,
        {
            footer: 'The bot role needs these permissions in Server Settings → Roles'
        }
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
        COLORS.PERMISSION,
        {
            footer: 'Only authorized members can access this feature'
        }
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
        COLORS.WARNING,
        {
            footer: critical ? 'Error code: DB_CRITICAL' : 'This usually resolves quickly'
        }
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
        COLORS.ERROR,
        {
            footer: 'If this continues, please contact support'
        }
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
        COLORS.WARNING,
        {
            footer: 'Make sure the spelling is correct'
        }
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

    // Try to send error message
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (followUpError) {
        logger.error('Could not send error message:', followUpError, 'ErrorHandler');
    }
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
    COLORS
};
