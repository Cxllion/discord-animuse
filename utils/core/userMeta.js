const { getRoleCategories, getServerRoles } = require('./database');

/**
 * Dynamically determines the title for a user based on their roles.
 * Moderators (Council category) -> Manager
 * Standard Users -> Reader
 * 
 * @param {import('discord.js').GuildMember} member 
 * @returns {Promise<string>} 'Manager' or 'Reader'
 */
const getDynamicUserTitle = async (member) => {
    if (!member) return 'Reader';
    const guildId = member.guild.id;

    try {
        const [categories, serverRoles] = await Promise.all([
            getRoleCategories(guildId),
            getServerRoles(guildId)
        ]);

        const councilCat = categories.find(c => c.name === 'Council');
        if (!councilCat) return 'Reader';

        const councilRoles = serverRoles
            .filter(sr => sr.category_id === councilCat.id)
            .map(sr => sr.role_id);

        const isManager = member.roles.cache.some(role => councilRoles.includes(role.id));
        return isManager ? 'Manager' : 'Reader';
    } catch (err) {
        console.error('[UserMeta] Error determining user title:', err);
        return 'Reader';
    }
};

module.exports = { getDynamicUserTitle };
