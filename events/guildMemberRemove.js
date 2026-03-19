const { Events } = require('discord.js');
const supabase = require('../utils/core/supabaseClient');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (!supabase) return;

        // --- Test Bot Restriction ---
        // Skip automated cleanup for test bot to avoid conflicts with main bot
        if (member.client.isTestBot) return;

        try {

            // Remove user subscriptions to stop ghost-polling for this specific user
            await supabase.from('subscriptions').delete()
                .eq('guild_id', member.guild.id)
                .eq('user_id', member.id);
                
        } catch (error) {
            logger.error(`Error cleaning up after member leave for ${member.id}:`, error, 'Event');
        }
    },
};
