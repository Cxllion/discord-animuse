const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

const linkAnilistAccount = async (userId, guildId, username) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };
    const { data, error } = await supabase
        .from('users')
        .upsert({ user_id: userId, guild_id: guildId, anilist_username: username }, { onConflict: 'user_id, guild_id' })
        .select()
        .single();
    return { data, error };
};

const unlinkAnilistAccount = async (userId, guildId) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };
    const { data, error } = await supabase
        .from('users')
        .update({ anilist_username: null })
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .select();
    return { data, error };
};

const getLinkedAnilist = async (userId, guildId) => {
    if (!supabase) return null;
    const { data } = await supabase.from('users').select('anilist_username').eq('user_id', userId).eq('guild_id', guildId).single();
    return data ? data.anilist_username : null;
};

const getUserBannerConfig = async (userId, guildId) => {
    if (!supabase) return { source: 'PRESET', customUrl: null };
    const { data, error } = await supabase.from('users').select('banner_source, background_url').eq('user_id', userId).eq('guild_id', guildId).single();
    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserBannerConfig: ' + error.message, null, 'Database');
    
    return {
        source: data ? (data.banner_source || 'PRESET') : 'PRESET',
        customUrl: data ? data.background_url : null
    };
};

const updateUserBannerConfig = async (userId, guildId, source, url = undefined) => {
    if (!supabase) return { error: 'No DB' };
    const updates = { banner_source: source };
    if (url !== undefined) updates.background_url = url;
    
    return await supabase.from('users').upsert({ user_id: userId, guild_id: guildId, ...updates }, { onConflict: 'user_id, guild_id' }).select();
};

const clearUserBannerGlobally = async (userId) => {
    if (!supabase) return;
    await supabase.from('users').update({ background_url: null, banner_source: 'PRESET' }).eq('user_id', userId);
};

const getUserTitle = async (userId, guildId) => {
    if (!supabase) return 'Muse Reader';
    const { data, error } = await supabase.from('users').select('selected_title').eq('user_id', userId).eq('guild_id', guildId).single();
    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserTitle: ' + error.message, null, 'Database');
    let t = data ? (data.selected_title || 'Muse Reader') : 'Muse Reader';
    if (t === 'Muse Player') t = 'Muse Reader';
    return t;
};

const updateUserTitle = async (userId, guildId, title) => {
    if (!supabase) return;
    await supabase.from('users').update({ selected_title: title }).eq('user_id', userId).eq('guild_id', guildId);
};

const getUserColor = async (userId, guildId) => {
    if (!supabase) return '#FFACD1';
    const { data, error } = await supabase.from('users').select('primary_color').eq('user_id', userId).eq('guild_id', guildId).single();
    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserColor: ' + error.message, null, 'Database');
    return data ? (data.primary_color || '#FFACD1') : '#FFACD1';
};

const updateUserColor = async (userId, guildId, color) => {
    if (!supabase) return;
    await supabase.from('users').update({ primary_color: color }).eq('user_id', userId).eq('guild_id', guildId);
};

const getUserAvatarConfig = async (userId, guildId) => {
    if (!supabase) return { source: 'DISCORD_GLOBAL', customUrl: null, anilistUsername: null };
    const { data } = await supabase.from('users').select('avatar_source, custom_avatar_url, anilist_username').eq('user_id', userId).eq('guild_id', guildId).single();
    return { 
        source: data ? (data.avatar_source || 'DISCORD_GLOBAL') : 'DISCORD_GLOBAL', 
        customUrl: data ? data.custom_avatar_url : null,
        anilistUsername: data ? data.anilist_username : null
    };
};

const updateUserAvatarConfig = async (userId, guildId, source, customUrl = undefined) => {
    if (!supabase) return;
    const updates = { avatar_source: source };
    if (customUrl !== undefined) updates.custom_avatar_url = customUrl;
    
    await supabase.from('users').upsert({ user_id: userId, guild_id: guildId, ...updates }, { onConflict: 'user_id, guild_id' });
};

const getBulkUserAvatarConfig = async (guildId, userIds) => {
    if (!supabase || userIds.length === 0) return {};
    const { data } = await supabase.from('users').select('user_id, avatar_source, custom_avatar_url, anilist_username').eq('guild_id', guildId).in('user_id', userIds);
    const map = {};
    if (data) data.forEach(row => { map[row.user_id] = { source: row.avatar_source || 'DISCORD_GLOBAL', customUrl: row.custom_avatar_url, anilistUsername: row.anilist_username }; });
    return map;
};

const getOwnedTitles = async (userId) => {
    if (!supabase) return ['Muse Reader'];
    const { data } = await supabase.from('user_titles').select('title').eq('user_id', userId);
    let titles = data ? data.map(r => r.title) : [];
    titles = titles.filter(t => t !== 'Muse Player');
    if (!titles.includes('Muse Reader')) titles.unshift('Muse Reader');
    return titles;
};

const addTitle = async (userId, title) => {
    if (!supabase) return;
    await supabase.from('user_titles').insert({ user_id: userId, title }).select();
};

const addUserFavorite = async (userId, mediaId, title, coverUrl) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase.from('user_favorites').upsert({ user_id: userId, media_id: mediaId, title_romaji: title, cover_url: coverUrl }, { onConflict: 'user_id, media_id' }).select().single();
};

const removeUserFavorite = async (userId, mediaId) => {
    if (!supabase) return;
    await supabase.from('user_favorites').delete().eq('user_id', userId).eq('media_id', mediaId);
};

const getUserFavoritesLocal = async (userId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('user_favorites').select('*').eq('user_id', userId).order('added_at', { ascending: false });
    return data || [];
};

const getLinkedUsersForFeed = async (guildId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('users')
        .select('user_id, anilist_username, is_track_sync')
        .eq('guild_id', String(guildId))
        .not('anilist_username', 'is', null);

    if (error) {
        logger.error(`[userService] Error fetching linked users for ${guildId}:`, error);
        return [];
    }
    
    return data || [];
};

/**
 * Enable or disable persistent Auto-Sync for a user's AniList tracking.
 */
const toggleTrackSync = async (userId, guildId, state = true) => {
    if (!supabase) return;
    await supabase.from('users').upsert({ 
        user_id: userId, 
        guild_id: guildId, 
        is_track_sync: state 
    }, { onConflict: 'user_id, guild_id' });
};

/**
 * Find all users across all guilds who have Auto-Sync enabled.
 */
const getAutoSyncUsers = async () => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('users')
        .select('user_id, guild_id, anilist_username')
        .eq('is_track_sync', true)
        .not('anilist_username', 'is', null);
    
    return data || [];
};

const updateLastActivityId = async (userId, guildId, activityId) => {
    // This column is missing in Supabase, so we use memory-based tracking for now
    // to avoid PGRST204 errors until the user runs the schema migration.
    return;
};

const getActivityCache = async (userId, guildId, mediaId) => {
    // Gracefully handle missing table
    if (!supabase) return null;
    try {
        const { data } = await supabase
            .from('activity_cache')
            .select('*')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .eq('media_id', mediaId)
            .single();
        return data;
    } catch (e) {
        return null; // Table likely missing
    }
};

const upsertActivityCache = async (userId, guildId, mediaId, messageId, startProgress, endProgress) => {
    if (!supabase) return;
    await supabase
        .from('activity_cache')
        .upsert({
            user_id: userId,
            guild_id: guildId,
            media_id: mediaId,
            message_id: messageId,
            start_progress: startProgress.toString(),
            end_progress: endProgress.toString(),
            last_updated: new Date().toISOString()
        }, { onConflict: 'user_id, guild_id, media_id' });
};

const clearActivityCache = async (userId, guildId, mediaId) => {
    if (!supabase) return;
    await supabase
        .from('activity_cache')
        .delete()
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .eq('media_id', mediaId);
};

/**
 * Check if an activity ID has already been posted (DB-backed, Render-safe).
 * Returns false if the `activity_posted` table doesn't exist yet.
 */
const wasPostedInDB = async (activityId) => {
    if (!supabase) return false;
    try {
        const { data, error } = await supabase
            .from('activity_posted')
            .select('activity_id')
            .eq('activity_id', String(activityId))
            .maybeSingle();
        if (error && error.code === 'PGRST200') return false; // Table missing
        return !!data;
    } catch (e) {
        return false;
    }
};

/**
 * Persistently mark activity IDs as posted (DB-backed, Render-safe).
 * Can accept simple IDs or objects with metadata for session merging.
 * @param {Array<string|object>} activities - List of activity IDs or objects { id, userId, mediaId, channelId, messageId, progress, status }
 */
const markPostedInDB = async (activities) => {
    if (!supabase) return false;
    try {
        const rows = activities.map(act => {
            if (typeof act === 'string') return { activity_id: String(act) };
            return {
                activity_id: String(act.id),
                user_id: String(act.userId),
                media_id: String(act.mediaId),
                channel_id: String(act.channelId),
                message_id: String(act.messageId),
                progress: String(act.progress),
                status: String(act.status),
                posted_at: new Date()
            };
        });

        const { error } = await supabase
            .from('activity_posted')
            .upsert(rows, { onConflict: 'activity_id' });
            
        if (error && error.code === 'PGRST200') return false; // Table missing
        return !error;
    } catch (e) {
        return false;
    }
};

/**
 * Find the most recent post for a user/media combination to allow for merging.
 */
const findRecentActivityPostInDB = async (userId, mediaId, channelId) => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from('activity_posted')
            .select('*')
            .eq('user_id', String(userId))
            .eq('media_id', String(mediaId))
            .eq('channel_id', String(channelId))
            .not('message_id', 'is', null) // Prioritize posts we can actually delete
            .gt('posted_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()) // Extended window: 48h for better media deduplication
            .order('posted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) return null;
        return data;
    } catch (e) {
        return null;
    }
};

/**
 * Purge activity logs older than 72 hours from Supabase to prevent table bloat.
 * We only need this data during the active binge window.
 */
const clearOldActivityPostsInDB = async () => {
    if (!supabase) return;
    try {
        const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        await supabase
            .from('activity_posted')
            .delete()
            .lt('posted_at', cutoff);
    } catch (e) {}
};

module.exports = {
    linkAnilistAccount,
    unlinkAnilistAccount,
    getLinkedAnilist,
    updateUserBannerConfig,
    getUserBannerConfig,
    clearUserBannerGlobally,
    getUserTitle,
    updateUserTitle,
    getUserColor,
    updateUserColor,
    getUserAvatarConfig,
    updateUserAvatarConfig,
    getBulkUserAvatarConfig,
    getOwnedTitles,
    addTitle,
    addUserFavorite,
    removeUserFavorite,
    getUserFavoritesLocal,
    getLinkedUsersForFeed,
    getAutoSyncUsers,
    toggleTrackSync,
    updateLastActivityId,
    getActivityCache,
    upsertActivityCache,
    clearActivityCache,
    wasPostedInDB,
    markPostedInDB,
    findRecentActivityPostInDB,
    clearOldActivityPostsInDB,
};
