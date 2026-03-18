const { PermissionFlagsBits } = require('discord.js');
const { fetchConfig } = require('./database');

/**
 * Checks if a member has premium privileges.
 * @param {GuildMember} member - Discord GuildMember object
 * @returns {Promise<boolean>}
 */
const hasPremium = async (member) => {
    if (!member) return false;

    // 1. Check for Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    // 2. Check for common benefactor/patron role names
    const hasSpecialRole = member.roles.cache.some(r => 
        r.name.includes('Benefactor') || 
        r.name.includes('Patron') || 
        r.name.includes('Premium') ||
        r.name.includes('Supporter')
    );
    if (hasSpecialRole) return true;

    // 3. Check for specific premium role configured in the guild
    if (member.guild) {
        const config = await fetchConfig(member.guild.id);
        if (config && config.premium_role_id) {
            if (member.roles.cache.has(config.premium_role_id)) return true;
        }
    }

    return false;
};

module.exports = { hasPremium };
