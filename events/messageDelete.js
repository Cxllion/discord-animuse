const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild) return;

        // --- Test Bot Restriction ---
        // Skip thread cleaning for test bot to avoid conflicts with main bot
        if (message.client.isTestBot) return;

        // Fetch config to check if this is a gallery channel

        const config = await fetchConfig(message.guild.id);
        if (!config || !config.gallery_channel_ids) return;

        // Check if the deleted message was in a gallery channel
        if (config.gallery_channel_ids.includes(message.channelId)) {
            // Attempt to find and delete the associated thread
            // Note: message.thread is only available if the message was cached
            if (message.thread) {
                try {
                    await message.thread.delete('Original gallery post was deleted.');
                    logger.info(`[Gallery Clean-up] Deleted thread ${message.thread.id} because the original post was removed.`, 'GalleryEvent');
                } catch (error) {
                    // 10008 = Unknown Message, 10003 = Unknown Channel, 50013 = Missing Permissions
                    if (error.code !== 10008 && error.code !== 10003) {
                        logger.error(`[Gallery Clean-up] Failed to delete thread associated with message ${message.id}:`, error, 'GalleryEvent');
                    }
                }
            }
        }
    },
};
