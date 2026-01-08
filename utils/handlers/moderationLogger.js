const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { logModerationAction } = require('../core/database');

/**
 * Logs a moderation action to the database and the guild's log channel.
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User} targetUser 
 * @param {import('discord.js').User} moderator 
 * @param {string} actionType - 'WARN', 'MUTE', 'KICK', 'BAN', 'PURGE'
 * @param {string} reason 
 */
const logAction = async (guild, targetUser, moderator, actionType, reason) => {
    // 1. Log to Database
    await logModerationAction(guild.id, targetUser.id, moderator.id, actionType, reason).catch(console.error);

    // 2. Log to Channel
    try {
        const { fetchConfig } = require('../core/database');
        const config = await fetchConfig(guild.id);

        if (config && config.logs_channel_id) {
            const channel = await guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.WARNING)
                    .setTitle(`🛡️ Moderation: ${actionType}`)
                    .addFields(
                        { name: 'Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                        { name: 'Moderator', value: `${moderator.tag}`, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided', inline: false }
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();

                // Color coding
                if (actionType === 'BAN') embed.setColor(CONFIG.COLORS.ERROR);
                if (actionType === 'KICK') embed.setColor(CONFIG.COLORS.ERROR);
                if (actionType === 'PURGE') embed.setColor(CONFIG.COLORS.INFO);

                await channel.send({ embeds: [embed] });
            }
        }
    } catch (e) {
        console.error('Failed to send log to channel:', e);
    }
};

module.exports = { logAction };
