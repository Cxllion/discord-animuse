const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateLogEmbed } = require('../utils/generators/logEmbed');
const logger = require('../utils/core/logger');
const CONFIG = require('../utils/config');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild) return;
        if (message.client.isTestBot) return;

        // Issue 13: Only run gallery cleanup on the Core bot instance
        const botType = CONFIG.BOT_TYPE || 'main';

        const config = await fetchConfig(message.guild.id);
        if (!config) return;

        // --- 1. Gallery Clean-up Logic ---
        // Issue 13: Guard so Main bot doesn't wastefully attempt thread cleanup
        if ((botType === 'core' || botType === 'test') &&
            config.gallery_channel_ids &&
            config.gallery_channel_ids.map(String).includes(String(message.channelId))) {

            // Issue 6: message.thread is almost never populated for deleted/partial messages.
            // Instead, search active (then archived) threads for a thread whose starterId matches.
            try {
                const channel = message.channel ?? await message.guild.channels.fetch(message.channelId).catch(() => null);
                if (channel) {
                    let targetThread = null;

                    // Check active threads first (fastest path)
                    const activeThreads = await channel.threads.fetchActive().catch(() => null);
                    if (activeThreads) {
                        targetThread = activeThreads.threads.find(t => t.id === message.id);
                    }

                    // Fall back to recently archived threads if not found
                    if (!targetThread) {
                        const archivedThreads = await channel.threads.fetchArchived({ limit: 10 }).catch(() => null);
                        if (archivedThreads) {
                            targetThread = archivedThreads.threads.find(t => t.id === message.id);
                        }
                    }

                    if (targetThread) {
                        await targetThread.delete('Original gallery post was deleted.');
                    }
                }
            } catch (error) {
                if (error.code !== 10008 && error.code !== 10003) {
                    logger.error(`[Gallery Clean-up] Failed to delete thread:`, error, 'GalleryEvent');
                }
            }
        }

        // --- 2. Activity Logging ---
        if (config.logs_channel_id) {
            // We can only log cached messages
            if (message.partial) return;
            if (message.author?.bot) return;

            const logChannel = message.guild.channels.cache.get(config.logs_channel_id);
            if (logChannel) {
                const embed = generateLogEmbed(
                    'Message Deleted',
                    `A record has been removed from the archives in <#${message.channel.id}>.`,
                    'ACTION',
                    { name: message.author.tag, iconURL: message.author.displayAvatarURL() }
                )
                .addFields(
                    { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'User ID', value: `\`${message.author.id}\``, inline: true },
                    { name: 'Content', value: message.content?.substring(0, 1024) || '*No text content*' }
                );

                if (message.attachments.size > 0) {
                    embed.addFields({ name: 'Attachments', value: `\`${message.attachments.size}\` file(s) were attached.` });
                }

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    },
};
