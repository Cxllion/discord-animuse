const { Events } = require('discord.js');
const supabase = require('../utils/core/supabaseClient');
const { fetchConfig } = require('../utils/core/database');
const { generateLogEmbed } = require('../utils/generators/logEmbed');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (!supabase) return;

        // --- Test Bot Restriction ---
        // Skip automated cleanup for test bot to avoid conflicts with main bot
        if (member.client.isTestBot) return;

        try {
            // --- 1. Database Cleanup ---
            // Remove user subscriptions to stop ghost-polling
            await supabase.from('subscriptions').delete()
                .eq('guild_id', member.guild.id)
                .eq('user_id', member.id);

            // Remove core user record (XP/Leveling)
            await supabase.from('users').delete()
                .eq('user_id', member.id)
                .eq('guild_id', member.guild.id);

        } catch (error) {
            logger.error(`Error cleaning up after member leave for ${member.id}:`, error, 'Event');
        }

        // --- 2. Departure Logging ---
        const config = await fetchConfig(member.guild.id);
        if (config?.logs_channel_id) {
            const logChannel = member.guild.channels.cache.get(config.logs_channel_id);
            if (logChannel) {
                const stayDuration = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
                const embed = generateLogEmbed(
                    'Archivist Departure',
                    `**${member.user.tag}** has departed from the archives.`,
                    'ALERT',
                    { name: member.user.tag, iconURL: member.user.displayAvatarURL() }
                )
                .addFields(
                    { name: 'User ID', value: `\`${member.id}\``, inline: true },
                    { name: 'Archival Stay', value: `\`${stayDuration} days\``, inline: true },
                    { name: 'Member Count', value: `\`${member.guild.memberCount}\``, inline: true }
                );

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    },
};
