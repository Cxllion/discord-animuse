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
            const config = await fetchConfig(member.guild.id);
            const { getWelcomeTracking, deleteWelcomeTracking } = require('../utils/services/welcomeService');
            const tracking = await getWelcomeTracking(member.id, member.guild.id);

            // --- 1.1 Anti-Ghosting Protocol ---
            if (config?.welcome_antighost_enabled !== false && tracking && !tracking.has_spoken) {
                logger.info(`[Anti-Ghosting] Cleanup triggered for ${member.user.tag} (Left without speaking)`, 'Welcome');
                
                // 1. Delete Welcome Card (Image)
                if (tracking.welcome_msg_id && tracking.welcome_channel_id) {
                    const channel = member.guild.channels.cache.get(tracking.welcome_channel_id);
                    if (channel) {
                        try {
                            const msg = await channel.messages.fetch(tracking.welcome_msg_id);
                            if (msg) await msg.delete();
                        } catch (e) { /* Already deleted or no perms */ }
                    }
                }

                // 2. Edit Greeting Message (Text)
                if (tracking.greeting_msg_id && tracking.greeting_channel_id) {
                    const channel = member.guild.channels.cache.get(tracking.greeting_channel_id);
                    if (channel) {
                        try {
                            const msg = await channel.messages.fetch(tracking.greeting_msg_id);
                            if (msg) {
                                await msg.edit({
                                    content: `🌫️ **[Expunged]** A visitor arrived, but left before their story could begin.`
                                });
                            }
                        } catch (e) { /* Already deleted or no perms */ }
                    }
                }
            }

            // Always cleanup tracking and core records
            await deleteWelcomeTracking(member.id, member.guild.id);

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
