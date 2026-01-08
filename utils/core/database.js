const supabase = require('./supabaseClient');

// Simple in-memory cache for guild configs
// Key: guildId, Value: { data: object, timestamp: number }
const configCache = new Map();
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Ensures the guild config exists. If not, returns default structure.
 * Uses a local cache to reduce DB calls.
 * @param {string} guildId 
 * @returns {Promise<object>} The guild configuration object.
 */
const fetchConfig = async (guildId) => {
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
        console.error(`[DB Error] fetching config for ${guildId}:`, error);
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
            mute_role_id: null
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
const upsertConfig = async (guildId, updates) => {
    if (!supabase) return { error: 'Supabase client not initialized.' };

    const { data, error } = await supabase
        .from('guild_configs')
        .upsert({ guild_id: guildId, ...updates })
        .select()
        .single();

    if (error) {
        console.error(`[DB Error] upserting config for ${guildId}:`, error);
        return { error };
    }

    // Update cache with new data
    configCache.set(guildId, { data, timestamp: Date.now() });

    return { data };
};

const { Client } = require('pg');

/**
 * Initializes the database by checking for tables and creating them if missing.
 */
const initializeDatabase = async () => {
    if (!process.env.DATABASE_URL) {
        console.warn('⚠️ DATABASE_URL missing. Skipping auto-migration.');
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // 1. Create guild_configs if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.guild_configs (
                guild_id text PRIMARY KEY,
                welcome_channel_id text,
                greeting_channel_id text,
                logs_channel_id text,
                gallery_channel_ids text[],
                xp_enabled boolean DEFAULT true,
                muse_role_id text,
                member_role_id text,
                bot_role_id text,
                super_bot_role_id text,
                mod_role_id text,
                mute_role_id text
            );
        `);

        // 1b. Alter guild_configs specifically for member_role_id migration AND general hardening
        try {
            // Hardening: Ensure base columns exist
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS welcome_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS greeting_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS logs_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS gallery_channel_ids text[];`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS xp_enabled boolean DEFAULT true;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS muse_role_id text;`);

            // Migrations found previously
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS member_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS bot_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS super_bot_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS airing_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS mod_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS mute_role_id text;`);
        } catch (e) { /* Ignore */ }

        // 2. Create users if not exists (Updated with anilist_username)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.users (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                user_id text NOT NULL,
                guild_id text NOT NULL,
                xp bigint DEFAULT 0,
                level integer DEFAULT 0,
                last_message timestamp with time zone DEFAULT now(),
                anilist_username text,
                background_url text,
                selected_title text DEFAULT 'Muse Player',
                CONSTRAINT users_guild_user_key UNIQUE (user_id, guild_id)
            );
        `);

        // 2b. Alter users to add anilist_username, background_url, and selected_title if they were created before this update
        try {
            // Hardening: Ensure base columns exist
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp bigint DEFAULT 0;`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level integer DEFAULT 0;`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_message timestamp with time zone DEFAULT now();`);

            // Migrations found previously
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS anilist_username text;`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS background_url text;`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS selected_title text DEFAULT 'Muse Player';`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#FFACD1';`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_source text DEFAULT 'DISCORD_GLOBAL';`); // DISCORD_GLOBAL, DISCORD_GUILD, ANILIST, CUSTOM
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_avatar_url text;`);
        } catch (e) { /* Ignore if exists */ }

        // 5. Create user_titles
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.user_titles (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                user_id text NOT NULL,
                title text NOT NULL,
                CONSTRAINT user_titles_unique_key UNIQUE (user_id, title)
            );
        `);
        // Hardening: Ensure base columns exist
        try { await client.query(`ALTER TABLE public.user_titles ADD COLUMN IF NOT EXISTS title text;`); } catch (e) { /* Ignore */ }

        // 5b. Create user_favorites
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.user_favorites (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                user_id text NOT NULL,
                media_id integer NOT NULL,
                title_romaji text,
                cover_url text,
                added_at timestamp with time zone DEFAULT now(),
                CONSTRAINT user_favorites_unique UNIQUE (user_id, media_id)
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS media_id integer;`);
            await client.query(`ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS title_romaji text;`);
            await client.query(`ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS cover_url text;`);
            await client.query(`ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS added_at timestamp with time zone DEFAULT now();`);
        } catch (e) { /* Ignore */ }

        // 6. Create parent_server_settings
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.parent_server_settings (
                guild_id text PRIMARY KEY,
                self_role_channel_id text,
                master_embed_id text,
                updated_at timestamp with time zone DEFAULT now()
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.parent_server_settings ADD COLUMN IF NOT EXISTS self_role_channel_id text;`);
            await client.query(`ALTER TABLE public.parent_server_settings ADD COLUMN IF NOT EXISTS master_embed_id text;`);
            await client.query(`ALTER TABLE public.parent_server_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();`);
        } catch (e) { /* Ignore */ }

        // 7. Create config_layers (The Loom)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.config_layers (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                guild_id text NOT NULL,
                name text NOT NULL,
                position integer DEFAULT 0,
                allow_multiple boolean DEFAULT true,
                created_at timestamp with time zone DEFAULT now()
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.config_layers ADD COLUMN IF NOT EXISTS name text;`);
            await client.query(`ALTER TABLE public.config_layers ADD COLUMN IF NOT EXISTS position integer;`);
            await client.query(`ALTER TABLE public.config_layers ADD COLUMN IF NOT EXISTS allow_multiple boolean DEFAULT true;`);
        } catch (e) { /* Ignore */ }

        // 8. Create config_layer_roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.config_layer_roles (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                layer_id bigint REFERENCES public.config_layers(id) ON DELETE CASCADE,
                role_id text NOT NULL,
                grid_order integer DEFAULT 0, 
                label text, -- Optional override for button label
                emoji text, -- Optional emoji
                CONSTRAINT unique_layer_role UNIQUE (layer_id, role_id)
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.config_layer_roles ADD COLUMN IF NOT EXISTS role_id text;`);
            await client.query(`ALTER TABLE public.config_layer_roles ADD COLUMN IF NOT EXISTS grid_order integer;`);
            await client.query(`ALTER TABLE public.config_layer_roles ADD COLUMN IF NOT EXISTS label text;`);
            await client.query(`ALTER TABLE public.config_layer_roles ADD COLUMN IF NOT EXISTS emoji text;`);
        } catch (e) { /* Ignore */ }

        // 9. Create subscriptions (New Architecture)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.subscriptions (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                guild_id text NOT NULL,
                user_id text NOT NULL,
                anilist_id integer NOT NULL,
                anime_title text,
                created_at timestamp with time zone DEFAULT now(),
                CONSTRAINT unique_user_sub UNIQUE (guild_id, user_id, anilist_id)
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS anilist_id integer;`);
            await client.query(`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS anime_title text;`);
            await client.query(`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();`);
        } catch (e) { /* Ignore */ }

        // 10. Create tracked_anime_state
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.tracked_anime_state (
                anilist_id integer PRIMARY KEY,
                last_episode integer DEFAULT 0,
                next_airing timestamp with time zone,
                updated_at timestamp with time zone DEFAULT now()
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.tracked_anime_state ADD COLUMN IF NOT EXISTS last_episode integer;`);
            await client.query(`ALTER TABLE public.tracked_anime_state ADD COLUMN IF NOT EXISTS next_airing timestamp with time zone;`);
            await client.query(`ALTER TABLE public.tracked_anime_state ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();`);
        } catch (e) { /* Ignore */ }

        // 11. Create moderation_logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.moderation_logs (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                guild_id text NOT NULL,
                user_id text NOT NULL,
                moderator_id text NOT NULL,
                action text NOT NULL, -- WARN, MUTE, KICK, BAN, PURGE
                reason text,
                created_at timestamp with time zone DEFAULT now()
            );
        `);
        // Hardening: Ensure base columns exist
        try {
            await client.query(`ALTER TABLE public.moderation_logs ADD COLUMN IF NOT EXISTS moderator_id text;`);
            await client.query(`ALTER TABLE public.moderation_logs ADD COLUMN IF NOT EXISTS action text;`);
            await client.query(`ALTER TABLE public.moderation_logs ADD COLUMN IF NOT EXISTS reason text;`);
        } catch (e) { /* Ignore */ }


        // 12. Create bingo_cards
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.bingo_cards (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                user_id text NOT NULL,
                guild_id text NOT NULL,
                title text NOT NULL,
                type text NOT NULL, -- 'monthly', 'yearly', 'custom'
                mode text DEFAULT 'ANIME', -- 'ANIME' or 'MANGA'
                entries jsonb DEFAULT '[]'::jsonb,
                removed_ids integer[] DEFAULT '{}'::integer[],
                background_url text,
                created_at timestamp with time zone DEFAULT now(),
                CONSTRAINT bingo_user_title_unique UNIQUE (user_id, guild_id, title)
            );
        `);

        // 12b. Alter bingo_cards to ensure columns exist (Migration Safety)
        try {
            // Essential Columns
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS guild_id text;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS user_id text;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS title text;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS type text;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS size integer;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();`);

            // New Features
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS entries jsonb DEFAULT '[]'::jsonb;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS background_url text;`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS mode text DEFAULT 'ANIME';`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS removed_ids integer[] DEFAULT '{}'::integer[];`);
            await client.query(`ALTER TABLE public.bingo_cards ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();`);

            // Legacy Clean-up (Fix for "period" and "grid_size" column errors)
            try { await client.query(`ALTER TABLE public.bingo_cards ALTER COLUMN period DROP NOT NULL;`); } catch (e) { console.warn('Legacy period fix skipped:', e.message); }
            try {
                console.log('Attempting to drop NOT NULL from grid_size...');
                await client.query(`ALTER TABLE public.bingo_cards ALTER COLUMN grid_size DROP NOT NULL;`);
                console.log('Successfully dropped NOT NULL from grid_size.');
            } catch (e) {
                console.warn('Legacy grid_size fix FAILED:', e.message);
            }
        } catch (e) {
            console.warn('⚠️ Manual migration step failed:', e.message);
        }

        // 13. PERFORMANCE INDICES
        await client.query(`CREATE INDEX IF NOT EXISTS idx_subs_anilist_id ON public.subscriptions(anilist_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_next_airing ON public.tracked_anime_state(next_airing);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_guild_user ON public.users(guild_id, user_id);`);

        // 14. RELOAD SCHEMA CACHE (Critical for Supabase/PostgREST to see new columns immediately)
        await client.query("NOTIFY pgrst, 'reload schema';");

        console.log('The archives have been organized. (Auto-Migration Complete)');
        return true;

    } catch (err) {
        console.warn('⚠️ [Offline Mode] Could not connect to the archives (DB Start Failed).');
        console.warn('   Reason:', err.message);
        return false;
    } finally {
        // Ensure client is closed only if it was connected or attempted
        try { await client.end(); } catch (e) { }
    }
};

/**
 * Link Discord user to AniList username.
 * @param {string} userId Discord User ID
 * @param {string} guildId Guild ID
 * @param {string} username AniList Username
 */
const linkAnilistAccount = async (userId, guildId, username) => {
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
const unlinkAnilistAccount = async (userId, guildId) => {
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
const getLinkedAnilist = async (userId, guildId) => {
    if (!supabase) return null;

    const { data } = await supabase
        .from('users')
        .select('anilist_username')
        .eq('user_id', userId)
        .eq('guild_id', guildId) // Technically could be global, but schema is per-guild currently for leveling.
        .single();

    return data ? data.anilist_username : null;
};

const updateUserBackground = async (userId, guildId, url) => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('users')
        .upsert({ user_id: userId, guild_id: guildId, background_url: url }, { onConflict: 'user_id, guild_id' })
        .select();
};

const getUserBackground = async (userId, guildId) => {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('users')
        .select('background_url')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') console.error('DB Error [getUserBackground]:', error.message);
    return data ? data.background_url : null;
};

const getUserTitle = async (userId, guildId) => {
    if (!supabase) return 'Muse Reader';
    const { data, error } = await supabase
        .from('users')
        .select('selected_title')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') console.error('DB Error [getUserTitle]:', error.message);

    let t = data ? (data.selected_title || 'Muse Reader') : 'Muse Reader';
    if (t === 'Muse Player') t = 'Muse Reader';
    return t;
};

const updateUserTitle = async (userId, guildId, title) => {
    if (!supabase) return;
    await supabase.from('users').update({ selected_title: title }).eq('user_id', userId).eq('guild_id', guildId);
};

// --- Colors ---
const getUserColor = async (userId, guildId) => {
    if (!supabase) return '#FFACD1';
    const { data, error } = await supabase
        .from('users')
        .select('primary_color')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error && error.code !== 'PGRST116') console.error('DB Error [getUserColor]:', error.message);
    return data ? (data.primary_color || '#FFACD1') : '#FFACD1';
};

const updateUserColor = async (userId, guildId, color) => {
    if (!supabase) return;
    await supabase.from('users').update({ primary_color: color }).eq('user_id', userId).eq('guild_id', guildId);
};

// --- Avatar ---
const getUserAvatarConfig = async (userId, guildId) => {
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

const updateUserAvatarConfig = async (userId, guildId, source, customUrl = null) => {
    if (!supabase) return;
    const updates = { avatar_source: source };
    if (customUrl !== undefined) updates.custom_avatar_url = customUrl;

    await supabase.from('users').update(updates).eq('user_id', userId).eq('guild_id', guildId);
};

const getBulkUserAvatarConfig = async (guildId, userIds) => {
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
const getOwnedTitles = async (userId) => {
    if (!supabase) return ['Muse Reader'];
    const { data } = await supabase.from('user_titles').select('title').eq('user_id', userId);
    let titles = data ? data.map(r => r.title) : [];
    // Filter out legacy
    titles = titles.filter(t => t !== 'Muse Player');
    if (!titles.includes('Muse Reader')) titles.unshift('Muse Reader');
    return titles;
};

const addTitle = async (userId, title) => {
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
const addUserFavorite = async (userId, mediaId, title, coverUrl) => {
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

const removeUserFavorite = async (userId, mediaId) => {
    if (!supabase) return;
    await supabase.from('user_favorites').delete().eq('user_id', userId).eq('media_id', mediaId);
};

const getUserFavoritesLocal = async (userId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });
    return data || [];
};

// --- Trackers (The Archivist's List) ---
const addTracker = async (guildId, userId, anilistId, animeTitle) => {
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

const removeTracker = async (guildId, userId, anilistId) => {
    if (!supabase) return;
    await supabase
        .from('subscriptions')
        .delete()
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .eq('anilist_id', anilistId);
};

const getUserTrackedAnime = async (guildId, userId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('guild_id', guildId)
        .eq('user_id', userId);
    return data || [];
};

const getAllTrackersForAnime = async (anilistId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('anilist_id', anilistId);
    return data || [];
};

const getAnimeDueForUpdate = async () => {
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
const getTrackedAnimeState = async (anilistId) => {
    if (!supabase) return null;
    const { data } = await supabase
        .from('tracked_anime_state')
        .select('*')
        .eq('anilist_id', anilistId)
        .single();
    return data;
};

const updateTrackedAnimeState = async (anilistId, lastEpisode, nextAiring) => {
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
    deleteBingoCard
};
