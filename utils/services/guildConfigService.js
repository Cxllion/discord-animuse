const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

// Simple in-memory cache for guild configs
const configCache = new Map();
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fetchConfig = async (guildId) => {
    if (configCache.has(guildId)) {
        const { data, timestamp } = configCache.get(guildId);
        if (Date.now() - timestamp < CONFIG_CACHE_TTL) {
            return data;
        } else {
            configCache.delete(guildId);
        }
    }

    if (!supabase) return null;

    const { data, error } = await supabase
        .from('guild_configs')
        .select('*')
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') {
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
            activity_channel_id: null,
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

    configCache.set(guildId, { data: configData, timestamp: Date.now() });
    return configData;
};

const upsertConfig = async (guildId, updates) => {
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

    configCache.set(guildId, { data, timestamp: Date.now() });
    return { data };
};

const assignChannel = async (guildId, key, channelId) => {
    if (!supabase) return;
    const updates = { [key]: channelId };
    await supabase.from('guild_configs').update(updates).eq('guild_id', guildId);
};

const getArchiveSettings = async (guildId) => {
    const config = await fetchConfig(guildId);
    return config?.archive_mirror_channel_id;
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

// Simple in-memory cache for channel activity pulses
const pulseCache = new Set();
const PULSE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

/**
 * Updates the last active timestamp for a channel.
 * Implements a 5-minute cooldown per channel to prevent database spam.
 * @param {string} guildId 
 * @param {string} channelId 
 */
const pulseChannelActivity = async (guildId, channelId) => {
    if (!supabase) return;

    const key = `${guildId}-${channelId}`;
    if (pulseCache.has(key)) return;

    // Set cooldown
    pulseCache.add(key);
    setTimeout(() => pulseCache.delete(key), PULSE_COOLDOWN);

    try {
        await supabase.from('guild_channels').upsert({
            guild_id: guildId,
            channel_id: channelId,
            last_active_at: new Date().toISOString()
        }, { onConflict: 'guild_id, channel_id' });
    } catch (err) {
        logger.error(`Failed to pulse activity for channel ${channelId}:`, err, 'Database');
    }
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
 * Manually flushes the entire configuration cache.
 */
const clearConfigCache = () => {
    configCache.clear();
    logger.info('Library Config Cache has been cleared and synchronized. ♡', 'Database');
};

module.exports = {
    fetchConfig,
    upsertConfig,
    assignChannel,
    getArchiveSettings,
    registerParentServer,
    getParentSettings,
    isParentServer,
    pulseChannelActivity,
    pinChannelPosition,
    getGuildChannelData,
    clearConfigCache
};
