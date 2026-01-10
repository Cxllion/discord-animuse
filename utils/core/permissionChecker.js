const { PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');

/**
 * Permission Checker for AniMuse
 * Validates bot and user permissions before command execution
 */

/**
 * Check if bot has required permissions in channel
 * @param {Interaction} interaction - Discord interaction
 * @param {string[]} required - Array of permission names (e.g., ['SendMessages', 'ManageRoles'])
 * @returns {Object} - {success: boolean, missing: string[]}
 */
const checkBotPermissions = async (interaction, required = []) => {
    if (!required || required.length === 0) {
        return { success: true, missing: [] };
    }

    try {
        const botMember = await interaction.guild.members.fetchMe();
        const channel = interaction.channel;
        const missing = [];

        for (const perm of required) {
            const permBit = PermissionFlagsBits[perm];
            if (!permBit) {
                logger.warn(`Unknown permission: ${perm}`, 'PermissionChecker');
                continue;
            }

            if (!channel.permissionsFor(botMember).has(permBit)) {
                missing.push(perm);
            }
        }

        return {
            success: missing.length === 0,
            missing
        };
    } catch (error) {
        logger.error('Error checking bot permissions:', error, 'PermissionChecker');
        return { success: false, missing: required };
    }
};

/**
 * Check if user has required permissions
 * @param {Interaction} interaction - Discord interaction
 * @param {string[]} required - Array of permission names
 * @returns {Object} - {success: boolean, missing: string[]}
 */
const checkUserPermissions = async (interaction, required = []) => {
    if (!required || required.length === 0) {
        return { success: true, missing: [] };
    }

    try {
        const member = interaction.member;
        const missing = [];

        for (const perm of required) {
            const permBit = PermissionFlagsBits[perm];
            if (!permBit) {
                logger.warn(`Unknown permission: ${perm}`, 'PermissionChecker');
                continue;
            }

            if (!member.permissions.has(permBit)) {
                missing.push(perm);
            }
        }

        return {
            success: missing.length === 0,
            missing
        };
    } catch (error) {
        logger.error('Error checking user permissions:', error, 'PermissionChecker');
        return { success: false, missing: required };
    }
};

/**
 * Format permission name for display
 * @param {string} perm - Permission name (e.g., 'ManageRoles')
 * @returns {string} - Formatted name (e.g., 'Manage Roles')
 */
const formatPermission = (perm) => {
    return perm
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/^./, str => str.toUpperCase());
};

/**
 * Get permission suggestions/solutions
 * @param {string[]} missing - Array of missing permissions
 * @returns {string} - Helpful suggestion text
 */
const getPermissionSuggestion = (missing) => {
    if (missing.length === 0) return '';

    const formatted = missing.map(formatPermission);

    if (missing.includes('Administrator')) {
        return '\n💡 Grant **Administrator** permission or assign specific permissions listed above.';
    }

    return '\n💡 Ask a server administrator to grant these permissions to the bot role.';
};

module.exports = {
    checkBotPermissions,
    checkUserPermissions,
    formatPermission,
    getPermissionSuggestion
};
