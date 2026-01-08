const supabase = require('../core/supabaseClient');
const { Collection } = require('discord.js');

const cooldowns = new Collection();

/**
 * Calculates level based on XP.
 * Formula: Level = Floor(0.1 * Sqrt(XP))
 * @param {number} xp 
 * @returns {number} level
 */
const calculateLevel = (xp) => {
    return Math.floor(0.1 * Math.sqrt(xp));
};

/**
 * Calculates progress to next level.
 * @param {number} xp 
 * @param {number} level 
 * @returns {object} { current, next, percent }
 */
const getLevelProgress = (xp, level) => {
    const currentLevelBase = 100 * (level * level);
    const nextLevelBase = 100 * ((level + 1) * (level + 1));
    const required = nextLevelBase - currentLevelBase;
    const current = xp - currentLevelBase;

    return {
        current: Math.max(0, current),
        required: required,
        percent: Math.min(1, Math.max(0, current / required))
    };
};

/**
 * Adds XP to a user. Handles cooldowns and DB updates.
 * @param {string} userId 
 * @param {string} guildId 
 */
const addXp = async (userId, guildId) => {
    if (!supabase) return;

    const key = `${guildId}-${userId}`;
    const now = Date.now();

    // Cooldown check (60 seconds)
    if (cooldowns.has(key)) {
        const expiration = cooldowns.get(key) + 60000;
        if (now < expiration) return;
    }

    // Set cooldown
    cooldowns.set(key, now);
    setTimeout(() => cooldowns.delete(key), 60000);

    // Random XP (15-25)
    const xpToAdd = Math.floor(Math.random() * (25 - 15 + 1)) + 15;

    try {
        // Fetch current user data
        // Note: Creating a constraint in SQL (unique on user_id, guild_id) implies we can upsert.
        // However, to add to existing value properly without race conditions, usually RPC is best.
        // For simplicity without RPC, we fetch-then-update or use upsert if we knew the old value.
        // Let's safe-bet with fetch first or try to use Supabase upsert logic.

        // Better approach: Select first.
        const { data: user, error } = await supabase
            .from('users')
            .select('xp, level')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .single();

        let newXp = xpToAdd;
        let oldLevel = 0;

        if (user) {
            newXp += user.xp;
            oldLevel = user.level;
        }

        const newLevel = calculateLevel(newXp);

        // Update DB
        const { error: upsertError } = await supabase
            .from('users')
            .upsert({
                user_id: userId,
                guild_id: guildId,
                xp: newXp,
                level: newLevel,
                last_message: new Date().toISOString()
            }, { onConflict: 'user_id, guild_id' });

        if (upsertError) {
            console.error('[XP Error] DB update failed:', upsertError);
        } else if (newLevel > oldLevel && oldLevel !== 0) {
            // Using 0 as check to avoid spam on first DB entry
            // We could emit a 'LevelUp' event here if we wanted to notify the user.
            // For now, silent tracking as requested, or maybe we will add notifications later.
            // console.log(`[Level Up] ${userId} reached Level ${newLevel}!`);
        }

    } catch (err) {
        console.error('[XP Error] Unexpected error:', err);
    }
};

/**
 * Get user rank data.
 * @param {string} userId 
 * @param {string} guildId 
 */
const getUserRank = async (userId, guildId) => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('users')
        .select('xp, level')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error) {
        if (error.code !== 'PGRST116') console.error('XP Error [getUserRank]:', error.message);
        return { xp: 0, level: 0, rank: 0 };
    }
    if (!data) return { xp: 0, level: 0, rank: 0 };

    // Calculate Rank (Count users with more XP)
    const { count, error: rankError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .gt('xp', data.xp);

    const rank = (rankError) ? '?' : (count + 1);

    return { ...data, rank };
};

/**
 * Get top 10 users by XP.
 * @param {string} guildId 
 */
const getTopUsers = async (guildId) => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('users')
        .select('user_id, xp, level')
        .eq('guild_id', guildId)
        .order('xp', { ascending: false })
        .limit(10);

    return data || [];
};

module.exports = {
    addXp,
    getUserRank,
    getLevelProgress,
    getTopUsers
};
