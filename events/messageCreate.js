const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const baseEmbed = require('../utils/generators/baseEmbed');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Fetch config (Note: In production, caching this is recommended to avoid DB spam)
        const config = await fetchConfig(message.guild.id);
        
        // --- Activity Pulse (For Hybrid Sorting) ---
        const { pulseChannelActivity } = require('../utils/core/database');
        await pulseChannelActivity(message.guild.id, message.channel.id);

        if (!config) return; // DB error or fresh guild

        // --- Archive Bureau (Pin Mirroring) ---
        if (message.type === 6 && config.archive_mirror_channel_id) {
            const archiveChannel = message.guild.channels.cache.get(config.archive_mirror_channel_id);
            if (archiveChannel) {
                try {
                    // Fetch the message that was just pinned
                    const pinnedMessages = await message.channel.messages.fetchPinned();
                    const latestPin = pinnedMessages.first();

                    if (latestPin) {
                        const { EmbedBuilder } = require('discord.js');
                        const archiveEmbed = new EmbedBuilder()
                            .setAuthor({ name: latestPin.author.tag, iconURL: latestPin.author.displayAvatarURL() })
                            .setDescription(latestPin.content || '*No content*')
                            .addFields(
                                { name: 'Source', value: `<#${message.channel.id}>`, inline: true },
                                { name: 'Jump', value: `[Go to Message](${latestPin.url})`, inline: true }
                            )
                            .setColor('#A78BFA')
                            .setTimestamp(latestPin.createdAt);

                        if (latestPin.attachments.size > 0) {
                            archiveEmbed.setImage(latestPin.attachments.first().url);
                        }

                        await archiveChannel.send({ 
                            content: `📌 **New Archive Entry** from <#${message.channel.id}>`, 
                            embeds: [archiveEmbed] 
                        });
                    }
                } catch (err) {
                    console.error('[ArchiveBureau] Failed to mirror pin:', err);
                }
            }
        }

        // --- Gallery Mode ---
        if (config.gallery_channel_ids && config.gallery_channel_ids.includes(message.channel.id)) {
            if (message.attachments.size > 0) {
                // Valid post: Create thread
                try {
                    await message.startThread({
                        name: `Discussion: ${message.author.username}’s Post`,
                        autoArchiveDuration: 1440, // 24 hours
                    });
                } catch (error) {
                    if (error.code === 160004) return; // Thread already exists, ignore.
                    logger.error(`[Gallery Error] Could not create thread in ${message.channel.id}:`, error, 'MessageEvent');
                }
            } else {
                // Invalid post: Delete and warn
                try {
                    // Check if deletable first to avoid permission errors logging spam
                    if (message.deletable) {
                        await message.delete();
                        const embed = baseEmbed()
                            .setDescription("I'm sorry, Manager, but this wing of the gallery is for visual archives only. Please use the threads for conversation! ♡")
                            .setColor('#FFACD1');

                        const warning = await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
                        setTimeout(() => {
                            warning.delete().catch(e => logger.error('Warning delete failed', e, 'MessageEvent'));
                        }, 5000);
                    }
                } catch (error) {
                    logger.error(`[Gallery Error] Could not delete message in ${message.channel.id}:`, error, 'MessageEvent');
                }
            }
            return; // Stop processing XP if in gallery
        }

        // --- Leveling Hook ---
        if (config.leveling_enabled !== false) {
            const { addXp } = require('../utils/services/leveling');
            await addXp(message.author.id, message.guild.id, message.member, message);
        }
    },
};
