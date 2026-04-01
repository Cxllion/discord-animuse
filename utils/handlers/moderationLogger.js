const baseEmbed = require('../generators/baseEmbed');
const CONFIG = require('../config');
const { logModerationAction } = require('../core/database');
const logger = require('../core/logger');

/**
 * Logs a moderation action to the database and the guild's log channel.
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User} targetUser 
 * @param {import('discord.js').User} moderator 
 * @param {string} actionType - 'WARN', 'MUTE', 'KICK', 'BAN', 'PURGE'
 * @param {string} reason 
 */
const logAction = async (guild, targetUser, moderator, actionType, reason) => {
    // --- Test Bot Restriction ---
    if (guild.client.isTestBot) return;

    // 1. Log to Database
    await logModerationAction(guild.id, targetUser.id, moderator.id, actionType, reason).catch(e => logger.error('DB Log Failed', e, 'ModerationLogger'));

    // 2. Log to Channel
    try {
        const { fetchConfig } = require('../core/database');
        const config = await fetchConfig(guild.id);

        if (config && config.logs_channel_id) {
            const channel = await guild.channels.fetch(config.logs_channel_id).catch(() => null);
            if (channel && channel.isTextBased()) {
                const embed = baseEmbed(`🛡️ Archival Enforcement: ${actionType}`, null, guild.client.user.displayAvatarURL())
                    .setColor(CONFIG.COLORS.WARNING)
                    .addFields(
                        { name: 'Target', value: `👤 **${targetUser.tag}** (\`${targetUser.id}\`)`, inline: true },
                        { name: 'Head Archivist', value: `🔨 **${moderator.tag}**`, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided', inline: false }
                    )
                    .setThumbnail(targetUser.displayAvatarURL());

                // Color coding
                if (actionType === 'BAN') embed.setColor(CONFIG.COLORS.ERROR);
                if (actionType === 'KICK') embed.setColor(CONFIG.COLORS.ERROR);
                if (actionType === 'PURGE') embed.setColor(CONFIG.COLORS.INFO);

                await channel.send({ embeds: [embed] });
            }
        }
    } catch (e) {
        logger.error('Failed to send log to channel:', e, 'ModerationLogger');
    }
};

module.exports = { logAction };
