const { EmbedBuilder, MessageFlags } = require('discord.js');
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

/**
 * Tips from the Animuse Librarian to make errors a bit cuter. ♡
 */
const LIBRARIAN_TIPS = [
    "Even digital pages need to be dusted sometimes! ♡",
    "The archives are vast, but I'll always find what you need. ✨",
    "A quiet library is a happy library... but a little chatting is okay! 🌸",
    "Don't worry, every record has a story, even the ones with errors. 🎀",
    "Sorting through memories takes time. Thank you for your patience! 📖",
    "The Grand Library is always expanding. Check back soon for new volumes! 🌟",
    "Remember to take a break and sip some tea while I organize the shelves. 🍵",
    "Oops! That volume seems to have been misplaced. Let me find it for you! 🔍",
    "The ink is still drying on some of these new records! 🖋️",
    "The archives resonate with your presence, Reader! ✨",
    "A book is a dream that you hold in your hands. ♡",
    "Shhh... even the data is sleeping in this wing. 🌙",
    "Found a bookmark! It says: 'You are doing great, Reader!' 🔖",
    "The more that you read, the more things you will know! 📚",
    "Every error is just an unwritten chapter. ✨"
];

const getCuteLibrarianTip = () => {
    return LIBRARIAN_TIPS[Math.floor(Math.random() * LIBRARIAN_TIPS.length)];
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
        .setColor(color)
        .setFooter({ 
            text: `Archival Note: ${getCuteLibrarianTip()}`, 
            iconURL: options.footerIcon || null 
        });

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
        '📚 Please Wait, Reader!',
        `You're browsing the archives too quickly.\n\nTry **${commandName ? `\`/${commandName}\`` : 'this command'}** again in **${timeText}**. ♡`,
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
        '🔒 Restricted Wing',
        `I need a few more archival keys (permissions) to do that:\n\n${formatted}\n\n${suggestion} ♡`,
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
        description = `I'm sorry, but this section of the library is restricted to senior archivists.\n\n**Required role**: ${requiredRole} ♡`;
    } else {
        const formatted = missing.map(p => `• ${formatPermission(p)}`).join('\n');
        description = `You need a few more credentials to access this wing, Reader:\n\n${formatted} ♡`;
    }

    return createErrorEmbed(
        '🚫 Entry Denied',
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
        ? 'A critical error occurred while accessing the library\'s records. The ink has spilled everywhere! 🖋️\n\n**Please contact support while I clean this up.** ♡'
        : 'The library\'s records are temporarily being reorganized by the archivists. ✨\n\n**Please try again in a moment.** ♡';

    return createErrorEmbed(
        '🗄️ [DATABASE OFFLINE] Archives Temporarily Sealed',
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
    const defaultMessage = 'An unexpected error occurred while processing your request. Even the best archivists make mistakes! ♡';
    const description = message || defaultMessage;

    return createErrorEmbed(
        '❌ [SYSTEM ERROR] Archival Hiccup',
        errorCode ? `${description}\n\n**Support ID**: \`${errorCode}\` 🎀` : description,
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
        '📖 Volume Not Found',
        `I'm sorry, Reader, but that ${itemType} doesn't seem to exist in our catalog yet. 📚\n\nPlease check your spelling or try another title! ♡`,
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
    // Suppress Unknown Interaction race conditions
    if (isUnknownInteraction(error)) return;

    logger.error(`Error in command ${commandName}:`, error, 'ErrorHandler');

    let embed;

    // Categorize error types
    if (error.message && error.message.includes('Missing Permissions')) {
        embed = createBotPermissionEmbed(['SendMessages', 'EmbedLinks']);
    } else if (error.message === 'AL_MAINTENANCE') {
        embed = createErrorEmbed(
            '🅰️ [API OFFLINE] AniList Archives Unavailable',
            'I have temporarily paused requests to AniList to protect your data. This usually means their servers are currently undergoing maintenance.\n\n**Please try this command again in a few minutes.** ♡',
            CONFIG.COLORS.WARNING
        );
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
        if (!isUnknownInteraction(followUpError)) {
            logger.error('Could not send error message:', followUpError, 'ErrorHandler');
        }
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

                // Get the support ID from the user embed if it exists
                const userEmbed = embed.data;
                if (userEmbed.description?.includes('**Support ID**')) {
                    const code = userEmbed.description.split('`').slice(-2, -1)[0];
                    reportEmbed.addFields({ name: 'Support ID', value: `\`${code}\``, inline: true });
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
    // Suppress Unknown Interaction race conditions
    if (isUnknownInteraction(error)) return;

    logger.error('Interaction Error:', error, 'ErrorHandler');
    
    const errorCode = `INT_${interaction.customId?.slice(0, 5).toUpperCase() || 'UI'}_${Date.now().toString().slice(-6)}`;
    const embed = createGeneralErrorEmbed(customMessage || 'An error occurred while processing this interaction.', errorCode);

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (e) {
        if (!isUnknownInteraction(e)) {
            logger.error('Failed to send interaction error message:', e, 'ErrorHandler');
        }
    }

    // --- AUTOMATED GUILD LOGGING ---
    if (interaction.guild) {
        try {
            const config = await fetchConfig(interaction.guild.id);
            if (config?.logs_channel_id) {
                const reportEmbed = baseEmbed('📋 Interaction Incident Report', 'An error occurred while processing an interaction.')
                    .addFields(
                        { name: 'Custom ID', value: `\`${interaction.customId || 'Unknown'}\``, inline: true },
                        { name: 'Type', value: interaction.type.toString(), inline: true },
                        { name: 'User', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                        { name: 'Error', value: `\`\`\`js\n${error.message || 'No message'}\n\`\`\``, inline: false }
                    )
                    .setColor(CONFIG.COLORS.ERROR)
                    .setTimestamp();

                if (errorCode) {
                    reportEmbed.addFields({ name: 'Support ID', value: `\`${errorCode}\``, inline: true });
                }

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
    getCuteLibrarianTip,
    createErrorEmbed,
    createCooldownEmbed,
    createBotPermissionEmbed,
    createUserPermissionEmbed,
    createDatabaseErrorEmbed,
    createGeneralErrorEmbed,
    createNotFoundEmbed,
    handleCommandError,
    handleInteractionError,
    isUnknownInteraction
};
