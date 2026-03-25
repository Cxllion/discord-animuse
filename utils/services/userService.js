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

const updateUserBackground = async (userId, guildId, url) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase.from('users').upsert({ user_id: userId, guild_id: guildId, background_url: url }, { onConflict: 'user_id, guild_id' }).select();
};

const getUserBackground = async (userId, guildId) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('users').select('background_url').eq('user_id', userId).eq('guild_id', guildId).single();
    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserBackground: ' + error.message, null, 'Database');
    return data ? data.background_url : null;
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
    if (!supabase) return { source: 'DISCORD_GLOBAL', customUrl: null };
    const { data } = await supabase.from('users').select('avatar_source, custom_avatar_url').eq('user_id', userId).eq('guild_id', guildId).single();
    return { source: data ? (data.avatar_source || 'DISCORD_GLOBAL') : 'DISCORD_GLOBAL', customUrl: data ? data.custom_avatar_url : null };
};

const updateUserAvatarConfig = async (userId, guildId, source, customUrl = null) => {
    if (!supabase) return;
    const updates = { avatar_source: source };
    if (customUrl !== undefined) updates.custom_avatar_url = customUrl;
    await supabase.from('users').update(updates).eq('user_id', userId).eq('guild_id', guildId);
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

module.exports = {
    linkAnilistAccount,
    unlinkAnilistAccount,
    getLinkedAnilist,
    updateUserBackground,
    getUserBackground,
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
    getUserFavoritesLocal
};
