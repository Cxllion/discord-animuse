const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Log a moderation action to the database.
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} moderatorId 
 * @param {string} action WARN, MUTE, KICK, BAN, PURGE
 * @param {string} reason 
 */
const logModerationAction = async (guildId, userId, moderatorId, action, reason) => {
    if (!supabase) return;
    return await supabase
        .from('moderation_logs')
        .insert({
            guild_id: guildId,
            user_id: userId,
            moderator_id: moderatorId,
            action: action,
            reason: reason
        })
        .select()
        .single();
};

/**
 * Fetch moderation logs for a user in a specific guild.
 * @param {string} guildId 
 * @param {string} userId 
 */
const getModerationLogs = async (guildId, userId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('moderation_logs')
        .select('*')
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    return data || [];
};

module.exports = {
    logModerationAction,
    getModerationLogs
};
