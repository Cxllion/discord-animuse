const supabase = require('./supabaseClient');
const logger = require('./logger');

const { fetchConfig, upsertConfig, assignChannel, getArchiveSettings } = require('../services/guildConfigService');
const { linkAnilistAccount, unlinkAnilistAccount, getLinkedAnilist, updateUserBackground, getUserBackground, getUserTitle, updateUserTitle, getUserColor, updateUserColor, getUserAvatarConfig, updateUserAvatarConfig, getBulkUserAvatarConfig, getOwnedTitles, addTitle, addUserFavorite, removeUserFavorite, getUserFavoritesLocal } = require('../services/userService');
const { addTracker, removeTracker, getUserTrackedAnime, getAllTrackersForAnime, getAnimeDueForUpdate, getTrackedAnimeState, updateTrackedAnimeState } = require('../services/animeTrackerService');


// Simple in-memory cache for guild configs
// Key: guildId, Value: { data: object, timestamp: number }
const DISABLED_configCache = new Map();
const DISABLED_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Ensures the guild config exists. If not, returns default structure.
 * Uses a local cache to reduce DB calls.
 * @param {string} guildId 
 * @returns {Promise<object>} The guild configuration object.
 */
const DISABLED_fetchConfig = async (guildId) => {
    // Check cache first
    if (configCache.has(guildId)) {
        const { data, timestamp } = configCache.get(guildId);
        if (Date.now() - timestamp < CONFIG_CACHE_TTL) {
            return data;
        } else {
            configCache.delete(guildId); // Expired
        }
    }

    if (!supabase) return null;

    const { data, error } = await supabase
        .from('guild_configs')
        .select('*')
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
        logger.error(`DB Error fetching config for ${guildId}:`, error, 'Database');
    }

    let configData = data;

    if (!configData) {
        configData = {
            guild_id: guildId,
            welcome_channel_id: null,
            greeting_channel_id: null,
            logs_channel_id: null,
            gallery_channel_ids: [],
            xp_enabled: true,
            muse_role_id: null,
            member_role_id: null,
            mod_role_id: null,
            mute_role_id: null,
            booster_role_id: null,
            premium_role_id: null,
            boutique_thumbnail: null,
            boutique_footer: null
        };
    }

    // Update cache
    configCache.set(guildId, { data: configData, timestamp: Date.now() });

    return configData;
};

/**
 * Upserts the guild configuration.
 * Updates the local cache immediately.
 * @param {string} guildId 
 * @param {object} updates Object containing fields to update.
 * @returns {Promise<object>} data or error
 */
const DISABLED_upsertConfig = async (guildId, updates) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };

    const { data, error } = await supabase
        .from('guild_configs')
        .upsert({ guild_id: guildId, ...updates })
        .select()
        .single();

    if (error) {
        logger.error(`DB Error upserting config for ${guildId}:`, error, 'Database');
        return { error };
    }

    // Update cache with new data
    configCache.set(guildId, { data, timestamp: Date.now() });

    return { data };
};

const initializeDatabase = async () => { return true; };

/**
 * Link Discord user to AniList username.
 * @param {string} userId Discord User ID
 * @param {string} guildId Guild ID
 * @param {string} username AniList Username
 */
const DISABLED_linkAnilistAccount = async (userId, guildId, username) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };

    const { data, error } = await supabase
        .from('users')
        .upsert({ user_id: userId, guild_id: guildId, anilist_username: username }, { onConflict: 'user_id, guild_id' })
        .select()
        .single();

    return { data, error };
};

/**
 * Unlink Discord user from AniList.
 * @param {string} userId 
 * @param {string} guildId 
 */
const DISABLED_unlinkAnilistAccount = async (userId, guildId) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };

    // Since users row "should" exist if they are unlinking (or even if not),
    // we use update. If row doesn't exist, nothing happens, which is fine (effectively unlinked).
    const { data, error } = await supabase
        .from('users')
        .update({ anilist_username: null })
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .select();

    return { data, error };
};

/**
 * Get linked AniList username.
 * @param {string} userId 
 * @param {string} guildId 
 */
const DISABLED_getLinkedAnilist = async (userId, guildId) => {
    if (!supabase) return null;

    const { data } = await supabase
        .from('users')
        .select('anilist_username')
        .eq('user_id', userId)
        .eq('guild_id', guildId) // Technically could be global, but schema is per-guild currently for leveling.
        .single();

    return data ? data.anilist_username : null;
};

const DISABLED_updateUserBackground = async (userId, guildId, url) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('users')
        .upsert({ user_id: userId, guild_id: guildId, background_url: url }, { onConflict: 'user_id, guild_id' })
        .select();
};

const DISABLED_getUserBackground = async (userId, guildId) => {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('users')
        .select('background_url')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserBackground: ' + error.message, null, 'Database');
    return data ? data.background_url : null;
};

const DISABLED_getUserTitle = async (userId, guildId) => {
    if (!supabase) return 'Muse Reader';
    const { data, error } = await supabase
        .from('users')
        .select('selected_title')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserTitle: ' + error.message, null, 'Database');

    let t = data ? (data.selected_title || 'Muse Reader') : 'Muse Reader';
    if (t === 'Muse Player') t = 'Muse Reader';
    return t;
};

const DISABLED_updateUserTitle = async (userId, guildId, title) => {
    if (!supabase) return;
    await supabase.from('users').update({ selected_title: title }).eq('user_id', userId).eq('guild_id', guildId);
};

// --- Colors ---
const DISABLED_getUserColor = async (userId, guildId) => {
    if (!supabase) return '#FFACD1';
    const { data, error } = await supabase
        .from('users')
        .select('primary_color')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') logger.error('DB Error getUserColor: ' + error.message, null, 'Database');
    return data ? (data.primary_color || '#FFACD1') : '#FFACD1';
};

const DISABLED_updateUserColor = async (userId, guildId, color) => {
    if (!supabase) return;
    await supabase.from('users').update({ primary_color: color }).eq('user_id', userId).eq('guild_id', guildId);
};

// --- Avatar ---
const DISABLED_getUserAvatarConfig = async (userId, guildId) => {
    if (!supabase) return { source: 'DISCORD_GLOBAL', customUrl: null };
    const { data } = await supabase
        .from('users')
        .select('avatar_source, custom_avatar_url')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    return {
        source: data ? (data.avatar_source || 'DISCORD_GLOBAL') : 'DISCORD_GLOBAL',
        customUrl: data ? data.custom_avatar_url : null
    };
};

const DISABLED_updateUserAvatarConfig = async (userId, guildId, source, customUrl = null) => {
    if (!supabase) return;
    const updates = { avatar_source: source };
    if (customUrl !== undefined) updates.custom_avatar_url = customUrl;

    await supabase.from('users').update(updates).eq('user_id', userId).eq('guild_id', guildId);
};

const DISABLED_getBulkUserAvatarConfig = async (guildId, userIds) => {
    if (!supabase || userIds.length === 0) return {};
    const { data } = await supabase
        .from('users')
        .select('user_id, avatar_source, custom_avatar_url, anilist_username')
        .eq('guild_id', guildId)
        .in('user_id', userIds);

    // Convert to map for easy lookup
    const map = {};
    if (data) {
        data.forEach(row => {
            map[row.user_id] = {
                source: row.avatar_source || 'DISCORD_GLOBAL',
                customUrl: row.custom_avatar_url,
                anilistUsername: row.anilist_username
            };
        });
    }
    return map;
};

// --- Titles Inventory ---
const DISABLED_getOwnedTitles = async (userId) => {
    if (!supabase) return ['Muse Reader'];
    const { data } = await supabase.from('user_titles').select('title').eq('user_id', userId);
    let titles = data ? data.map(r => r.title) : [];
    // Filter out legacy
    titles = titles.filter(t => t !== 'Muse Player');
    if (!titles.includes('Muse Reader')) titles.unshift('Muse Reader');
    return titles;
};

const DISABLED_addTitle = async (userId, title) => {
    if (!supabase) return;
    await supabase.from('user_titles').insert({ user_id: userId, title }).select();
};

// --- Parent Server Engine ---
const registerParentServer = async (guildId) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('parent_server_settings')
        .upsert({ guild_id: guildId })
        .select()
        .single();
};

const getParentSettings = async (guildId) => {
    if (!supabase) return null;
    const { data } = await supabase
        .from('parent_server_settings')
        .select('*')
        .eq('guild_id', guildId)
        .single();
    return data;
};

const isParentServer = async (guildId) => {
    const settings = await getParentSettings(guildId);
    return !!settings;
};

// --- Archivist's Loom (Layers) ---
const createLayer = async (guildId, name, allowMultiple = true) => {
    if (!supabase) return null;
    return await supabase
        .from('config_layers')
        .insert({ guild_id: guildId, name, allow_multiple: allowMultiple })
        .select()
        .single();
};

const getLayers = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('config_layers')
        .select(`
            *,
            roles:config_layer_roles(*)
        `)
        .eq('guild_id', guildId)
        .order('position', { ascending: true });

    return data || [];
};

const addRoleToLayer = async (layerId, roleId, label = null, emoji = null) => {
    if (!supabase) return;
    await supabase
        .from('config_layer_roles')
        .insert({ layer_id: layerId, role_id: roleId, label, emoji });
};

// --- Favorites ---
const DISABLED_addUserFavorite = async (userId, mediaId, title, coverUrl) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('user_favorites')
        .upsert({
            user_id: userId,
            media_id: mediaId,
            title_romaji: title,
            cover_url: coverUrl
        }, { onConflict: 'user_id, media_id' })
        .select()
        .single();
};

const DISABLED_removeUserFavorite = async (userId, mediaId) => {
    if (!supabase) return;
    await supabase.from('user_favorites').delete().eq('user_id', userId).eq('media_id', mediaId);
};

const DISABLED_getUserFavoritesLocal = async (userId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });
    return data || [];
};

// --- Trackers (The Archivist's List) ---
const DISABLED_addTracker = async (guildId, userId, anilistId, animeTitle) => {
    if (!supabase) return { error: 'No DB' };

    // 1. Add Tracker (Mapping table still 'subscriptions' for now)
    const sub = await supabase
        .from('subscriptions')
        .upsert({
            guild_id: guildId,
            user_id: userId,
            anilist_id: anilistId,
            anime_title: animeTitle
        }, { onConflict: 'guild_id, user_id, anilist_id' })
        .select()
        .single();

    // 2. Ensure Tracked State Exists (Efficiency: Ready for Scheduler)
    await supabase
        .from('tracked_anime_state')
        .upsert({
            anilist_id: anilistId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'anilist_id', ignoreDuplicates: true });

    return sub;
};

const DISABLED_removeTracker = async (guildId, userId, anilistId) => {
    if (!supabase) return;
    await supabase
        .from('subscriptions')
        .delete()
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .eq('anilist_id', anilistId);
};

const DISABLED_getUserTrackedAnime = async (guildId, userId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('guild_id', guildId)
        .eq('user_id', userId);
    return data || [];
};

const DISABLED_getAllTrackersForAnime = async (anilistId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('anilist_id', anilistId);
    return data || [];
};

const DISABLED_getAnimeDueForUpdate = async () => {
    if (!supabase) return [];

    // Check window: Now + 20 mins
    const futureWindow = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    // Logic: Fetch IDs where next_airing is either NULL (unknown/new) OR <= futureWindow
    // This dramatically reduces API calls for shows airing days from now.
    const { data, error } = await supabase
        .from('tracked_anime_state')
        .select('anilist_id')
        .or(`next_airing.is.null,next_airing.lte.${futureWindow}`);

    if (error) {
        // console.error('DB Error [getAnimeDueForUpdate]:', error.message);
        return [];
    }

    return data.map(r => r.anilist_id);
};

// --- Anime State Tracking ---
const DISABLED_getTrackedAnimeState = async (anilistId) => {
    if (!supabase) return null;
    const { data } = await supabase
        .from('tracked_anime_state')
        .select('*')
        .eq('anilist_id', anilistId)
        .single();
    return data;
};

const DISABLED_updateTrackedAnimeState = async (anilistId, lastEpisode, nextAiring) => {
    if (!supabase) return;
    await supabase
        .from('tracked_anime_state')
        .upsert({
            anilist_id: anilistId,
            last_episode: lastEpisode,
            next_airing: nextAiring,
            updated_at: new Date().toISOString()
        })
        .select();
};

// --- Moderation Logs ---
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

// --- Bingo Cards ---
const createBingoCard = async (userId, guildId, title, type, size, mode = 'ANIME') => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('bingo_cards')
        .insert({
            user_id: userId,
            guild_id: guildId,
            title,
            type,
            size,
            mode,
            entries: [] // Initialize empty
        })
        .select()
        .single();
};

const getBingoCards = async (userId, guildId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('bingo_cards')
        .select('*')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false });
    return data || [];
};

const getBingoCardById = async (id) => {
    if (!supabase) return null;
    const { data } = await supabase
        .from('bingo_cards')
        .select('*')
        .eq('id', id)
        .single();
    return data;
};

const updateBingoEntries = async (cardId, entries) => {
    return await updateBingoCard(cardId, { entries });
};

const updateBingoCard = async (cardId, updates) => {
    if (!supabase) return;
    return await supabase
        .from('bingo_cards')
        .update({ ...updates, updated_at: new Date() })
        .eq('id', cardId)
        .select()
        .single();
};

const deleteBingoCard = async (cardId) => {
    if (!supabase) return;
    await supabase
        .from('bingo_cards')
        .delete()
        .eq('id', cardId);
};

// --- Role Management ---
const getRoleCategories = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('role_categories').select('*').eq('guild_id', guildId).order('created_at', { ascending: true });
    return data || [];
};
const createRoleCategory = async (guildId, name) => {
    if (!supabase) return null;
    return await supabase.from('role_categories').insert({ guild_id: guildId, name }).select().single();
};
const deleteRoleCategory = async (categoryId) => {
    if (!supabase) return;
    await supabase.from('role_categories').delete().eq('id', categoryId);
};
const seedRoleCategories = async (guildId) => {
    if (!supabase) return;
    const defaults = [
        'Council',
        'Colors (Premium)',
        'Colors (Basic)',
        'Profile (Pronouns)',
        'Profile (Age)',
        'Profile (Region)',
        'Levels',
        'Pings',
        'Extra'
    ];
    
    const existing = await getRoleCategories(guildId);
    const existingNames = existing.map(c => c.name);
    
    const toInsert = defaults.filter(name => !existingNames.includes(name)).map(name => ({ guild_id: guildId, name }));
    
    if (toInsert.length > 0) {
        await supabase.from('role_categories').insert(toInsert);
    }
    return await getRoleCategories(guildId);
};
const getServerRoles = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('server_roles').select('*, category:role_categories(*)').eq('guild_id', guildId);
    return data || [];
};
const registerServerRole = async (guildId, roleId, categoryId = null) => {
    if (!supabase) return;
    return await supabase.from('server_roles').upsert({ role_id: roleId, guild_id: guildId, category_id: categoryId });
};
const registerServerRoles = async (records) => {
    if (!supabase || !records.length) return;
    return await supabase.from('server_roles').upsert(records);
};
const unregisterServerRole = async (roleId) => {
    if (!supabase) return;
    await supabase.from('server_roles').delete().eq('role_id', roleId);
};
const getLevelRoles = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('level_roles').select('*').eq('guild_id', guildId).order('level', { ascending: true });
    return data || [];
};
const setLevelRole = async (guildId, level, roleId) => {
    if (!supabase) return;
    return await supabase.from('level_roles').upsert({ guild_id: guildId, level, role_id: roleId });
};
const removeLevelRole = async (guildId, level) => {
    if (!supabase) return;
    await supabase.from('level_roles').delete().eq('guild_id', guildId).eq('level', level);
};


/**
 * Updates the last active timestamp for a channel.
 * @param {string} guildId 
 * @param {string} channelId 
 */
const pulseChannelActivity = async (guildId, channelId) => {
    if (!supabase) return;
    await supabase.from('guild_channels').upsert({
        guild_id: guildId,
        channel_id: channelId,
        last_active_at: new Date().toISOString()
    }, { onConflict: 'guild_id, channel_id' });
};

/**
 * Sets a pinned position for a channel within its category.
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {number} position 
 */
const pinChannelPosition = async (guildId, channelId, position) => {
    if (!supabase) return;
    await supabase.from('guild_channels').upsert({
        guild_id: guildId,
        channel_id: channelId,
        pinned_position: position
    }, { onConflict: 'guild_id, channel_id' });
};

/**
 * Fetches activity and pin data for all channels in a guild.
 * @param {string} guildId 
 */
const getGuildChannelData = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('guild_channels').select('*').eq('guild_id', guildId);
    return data || [];
};

/**
 * Centralized channel assignment update.
 * @param {string} guildId 
 * @param {string} key Configuration key (e.g., welcome_channel_id)
 * @param {string|null} channelId 
 */
const DISABLED_assignChannel = async (guildId, key, channelId) => {
    if (!supabase) return;
    const updates = { [key]: channelId };
    await supabase.from('guild_configs').update(updates).eq('guild_id', guildId);
};

/**
 * Fetches all pinned messages from a channel and mirrors them (Manual sync).
 * @param {string} guildId 
 * @param {string} channelId 
 */
const DISABLED_getArchiveSettings = async (guildId) => {
    const config = await fetchConfig(guildId);
    return config?.archive_mirror_channel_id;
};


module.exports = {
    fetchConfig,
    upsertConfig,
    initializeDatabase,
    linkAnilistAccount,
    unlinkAnilistAccount,
    getLinkedAnilist,
    updateUserBackground,
    getUserBackground,
    getUserTitle,
    updateUserTitle,
    getUserColor,
    updateUserColor,
    getOwnedTitles,
    addTitle,

    registerParentServer,
    getParentSettings,
    isParentServer,
    createLayer,
    getLayers,
    addRoleToLayer,
    // Favorites
    addUserFavorite,
    removeUserFavorite,
    getUserFavoritesLocal,
    // Avatar
    getUserAvatarConfig,
    getBulkUserAvatarConfig,
    updateUserAvatarConfig,
    // Trackers
    addTracker,
    removeTracker,
    getUserTrackedAnime,
    getAllTrackersForAnime,
    getAnimeDueForUpdate,
    getTrackedAnimeState,
    updateTrackedAnimeState,
    // Moderation
    logModerationAction,
    getModerationLogs,
    // Bingo
    createBingoCard,
    getBingoCards,
    getBingoCardById,
    updateBingoEntries,
    updateBingoCard,
    deleteBingoCard,
    // Role Management
    getRoleCategories,
    createRoleCategory,
    deleteRoleCategory,
    seedRoleCategories,
    getServerRoles,
    registerServerRole,
    registerServerRoles,
    unregisterServerRole,
    getLevelRoles,
    setLevelRole,
    removeLevelRole,
    pulseChannelActivity,
    pinChannelPosition,
    getGuildChannelData,
    assignChannel
};
