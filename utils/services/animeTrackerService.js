const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

const addTracker = async (guildId, userId, anilistId, animeTitle) => {
    if (!supabase) return { error: 'No DB' };
    const sub = await supabase.from('subscriptions').upsert({ guild_id: guildId, user_id: userId, anilist_id: anilistId, anime_title: animeTitle }, { onConflict: 'guild_id, user_id, anilist_id' }).select().single();
    await supabase.from('tracked_anime_state').upsert({ anilist_id: anilistId, updated_at: new Date().toISOString() }, { onConflict: 'anilist_id', ignoreDuplicates: true });
    return sub;
};

const removeTracker = async (guildId, userId, anilistId) => {
    if (!supabase) return;
    await supabase.from('subscriptions').delete().eq('guild_id', guildId).eq('user_id', userId).eq('anilist_id', anilistId);
};

const getUserTrackedAnime = async (guildId, userId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('subscriptions').select('*').eq('guild_id', guildId).eq('user_id', userId);
    return data || [];
};

const getAllTrackersForAnime = async (anilistId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('subscriptions').select('*').eq('anilist_id', anilistId);
    return data || [];
};

const getAnimeDueForUpdate = async () => {
    if (!supabase) return [];
    const futureWindow = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('tracked_anime_state').select('anilist_id').or(`next_airing.is.null,next_airing.lte.${futureWindow}`);
    if (error) return [];
    return data.map(r => r.anilist_id);
};

const getTrackedAnimeState = async (anilistId) => {
    if (!supabase) return null;
    const { data } = await supabase.from('tracked_anime_state').select('*').eq('anilist_id', anilistId).single();
    return data;
};

const updateTrackedAnimeState = async (anilistId, lastEpisode, nextAiring) => {
    if (!supabase) return;
    await supabase.from('tracked_anime_state').upsert({ anilist_id: anilistId, last_episode: lastEpisode, next_airing: nextAiring, updated_at: new Date().toISOString() }).select();
};

const removeAllTrackersForAnime = async (anilistId) => {
    if (!supabase) return;
    // Remove all users' subscriptions to this anime
    await supabase.from('subscriptions').delete().eq('anilist_id', anilistId);
    // Remove the global tracking state for this anime
    await supabase.from('tracked_anime_state').delete().eq('anilist_id', anilistId);
};

module.exports = {
    addTracker,
    removeTracker,
    getUserTrackedAnime,
    getAllTrackersForAnime,
    getAnimeDueForUpdate,
    getTrackedAnimeState,
    updateTrackedAnimeState,
    removeAllTrackersForAnime
};
