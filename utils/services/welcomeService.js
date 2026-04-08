const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Tracks a welcome event for anti-ghosting.
 */
const trackWelcome = async (userId, guildId, data) => {
    if (!supabase) return;
    try {
        const { error } = await supabase
            .from('welcome_tracking')
            .upsert({
                user_id: userId,
                guild_id: guildId,
                ...data,
                joined_at: new Date().toISOString()
            });

        if (error) logger.error(`Failed to track welcome for ${userId}:`, error, 'WelcomeService');
    } catch (err) {
        logger.error(`Error in trackWelcome for ${userId}:`, err, 'WelcomeService');
    }
};

/**
 * Marks a user as having spoken, protecting their welcome message.
 */
const markAsSpoken = async (userId, guildId) => {
    if (!supabase) return;
    try {
        const { error } = await supabase
            .from('welcome_tracking')
            .update({ has_spoken: true })
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .eq('has_spoken', false); // Only update if not already spoken

        if (error) logger.error(`Failed to mark as spoken for ${userId}:`, error, 'WelcomeService');
    } catch (err) {
        logger.error(`Error in markAsSpoken for ${userId}:`, err, 'WelcomeService');
    }
};

/**
 * Retreives tracking data for a user.
 */
const getWelcomeTracking = async (userId, guildId) => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from('welcome_tracking')
            .select('*')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .single();

        if (error && error.code !== 'PGRST116') logger.error(`Error fetching tracking for ${userId}:`, error, 'WelcomeService');
        return data;
    } catch (err) {
        logger.error(`Error in getWelcomeTracking for ${userId}:`, err, 'WelcomeService');
        return null;
    }
};

/**
 * Deletes tracking data.
 */
const deleteWelcomeTracking = async (userId, guildId) => {
    if (!supabase) return;
    try {
        await supabase
            .from('welcome_tracking')
            .delete()
            .eq('user_id', userId)
            .eq('guild_id', guildId);
    } catch (err) {
        logger.error(`Error in deleteWelcomeTracking for ${userId}:`, err, 'WelcomeService');
    }
};

module.exports = {
    trackWelcome,
    markAsSpoken,
    getWelcomeTracking,
    deleteWelcomeTracking
};
