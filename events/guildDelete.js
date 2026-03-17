const { Events } = require('discord.js');
const supabase = require('../utils/core/supabaseClient');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild) {
        if (!supabase) return;
        
        try {
            logger.info(`Bot removed from guild: ${guild.name} (${guild.id}). Cleaning up trackers...`, 'System');
            
            // Remove subscriptions to stop ghost-polling AniList
            await supabase.from('subscriptions').delete().eq('guild_id', guild.id);
            
            // Note: Users, bingo cards, and config logs are retained currently,
            // as users often accidentally kick and invite bots back.
            // But stripping subscriptions prevents the polling loop from doing useless API calls.
            
        } catch (error) {
            logger.error(`Error cleaning up after guild deletion for ${guild.id}:`, error, 'Event');
        }
    },
};
