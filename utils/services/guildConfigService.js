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

module.exports = {
    fetchConfig,
    upsertConfig,
    assignChannel,
    getArchiveSettings
};
