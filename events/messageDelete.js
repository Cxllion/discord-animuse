const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateLogEmbed } = require('../utils/generators/logEmbed');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild) return;
        if (message.client.isTestBot) return;

        const config = await fetchConfig(message.guild.id);
        if (!config) return;

        // --- 1. Gallery Clean-up Logic ---
        if (config.gallery_channel_ids && config.gallery_channel_ids.includes(message.channelId)) {
            if (message.thread) {
                try {
                    await message.thread.delete('Original gallery post was deleted.');
                } catch (error) {
                    if (error.code !== 10008 && error.code !== 10003) {
                        logger.error(`[Gallery Clean-up] Failed to delete thread:`, error, 'GalleryEvent');
                    }
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
