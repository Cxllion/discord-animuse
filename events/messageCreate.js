const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const baseEmbed = require('../utils/generators/baseEmbed');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Fetch config (Note: In production, caching this is recommended to avoid DB spam)
        const config = await fetchConfig(message.guild.id);
        if (!config) return; // DB error or fresh guild

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
                    console.error(`[Gallery Error] Could not create thread in ${message.channel.id}:`, error);
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
                            warning.delete().catch(console.error);
                        }, 5000);
                    }
                } catch (error) {
                    console.error(`[Gallery Error] Could not delete message in ${message.channel.id}:`, error);
                }
            }
            return; // Stop processing XP if in gallery
        }

        // --- Leveling Hook ---
        if (config.xp_enabled) {
            const { addXp } = require('../utils/services/leveling');
            await addXp(message.author.id, message.guild.id);
        }
    },
};
