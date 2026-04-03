require('dotenv').config();
const { Client } = require('pg');

const initializeDatabase = async () => {
    if (!process.env.DATABASE_URL) {
        console.warn('DATABASE_URL missing. Skipping auto-migration.');
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to Postgres for migration...');

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
                booster_role_id text,
                mod_role_id text,
                mute_role_id text,
                airing_channel_id text,
                activity_channel_id text
            );
        `);

        // 1b. Alter guild_configs specifically for key standardization and hardening
        try {
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS welcome_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS greeting_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS logs_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS gallery_channel_ids text[];`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS xp_enabled boolean DEFAULT true;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS muse_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS member_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS bot_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS super_bot_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS booster_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS airing_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS mod_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS mute_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS activity_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS leveling_enabled boolean DEFAULT true;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS level_up_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS archive_mirror_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS xp_level_up_emoji text DEFAULT '<a:level_up:1483138860417286358>';`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS auto_role_member text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS auto_role_bot text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS premium_role_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS banner_dump_channel_id text;`);
            
            // Boutique Persistence
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS boutique_channel_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS boutique_message_id text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS boutique_thumbnail text;`);
            await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS boutique_footer text;`);

            // Migration: Transfer data from redundant keys if they exist and target is null
            await client.query(`
                UPDATE public.guild_configs 
                SET member_role_id = COALESCE(member_role_id, auto_role_member)
                WHERE auto_role_member IS NOT NULL AND member_role_id IS NULL;
            `);
            await client.query(`
                UPDATE public.guild_configs 
                SET bot_role_id = COALESCE(bot_role_id, auto_role_bot)
                WHERE auto_role_bot IS NOT NULL AND bot_role_id IS NULL;
            `);

        } catch (e) { 
            console.error('[Database Migration] Error in Harden:', e);
        }

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
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_source text DEFAULT 'DISCORD_GLOBAL';`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_avatar_url text;`);
            await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_source text DEFAULT 'PRESET';`);
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

        // 12. Create activity_posted (Persistent Activity Tracking)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.activity_posted (
                activity_id text PRIMARY KEY,
                user_id text,
                media_id text,
                channel_id text,
                message_id text,
                progress text,
                status text,
                posted_at timestamp with time zone DEFAULT now()
            );
        `);
        // Migration Harden
        try {
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS user_id text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS media_id text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS channel_id text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS message_id text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS progress text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS status text;`);
            await client.query(`ALTER TABLE public.activity_posted ADD COLUMN IF NOT EXISTS posted_at timestamp with time zone DEFAULT now();`);
        } catch (e) { }

        // 13. Create activity_cache (Binge Merging)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.activity_cache (
                user_id text NOT NULL,
                guild_id text NOT NULL,
                media_id text NOT NULL,
                message_id text NOT NULL,
                start_progress text,
                end_progress text,
                last_updated timestamp with time zone DEFAULT now(),
                PRIMARY KEY (user_id, guild_id, media_id)
            );
        `);
        // Migration Harden
        try {
            await client.query(`ALTER TABLE public.activity_cache ADD COLUMN IF NOT EXISTS message_id text;`);
            await client.query(`ALTER TABLE public.activity_cache ADD COLUMN IF NOT EXISTS start_progress text;`);
            await client.query(`ALTER TABLE public.activity_cache ADD COLUMN IF NOT EXISTS end_progress text;`);
            await client.query(`ALTER TABLE public.activity_cache ADD COLUMN IF NOT EXISTS last_updated timestamp with time zone DEFAULT now();`);
        } catch (e) { }

        // 14. Create bingo_cards
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
            try { await client.query(`ALTER TABLE public.bingo_cards ALTER COLUMN period DROP NOT NULL;`); } catch (e) { console.warn('Legacy period fix skipped: ' + e.message); }
            try {
                await client.query(`ALTER TABLE public.bingo_cards ALTER COLUMN grid_size DROP NOT NULL;`);
            } catch (e) {
                // Ignore silent migration
            }
        } catch (e) {
            console.warn('Manual migration step failed: ' + e.message);
        }

        // 13. Create Role Management Tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.role_categories (
                id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                guild_id text NOT NULL,
                name text NOT NULL,
                created_at timestamp with time zone DEFAULT now(),
                CONSTRAINT unique_guild_category UNIQUE (guild_id, name)
            );
        `);
        try { await client.query(`ALTER TABLE public.role_categories ADD COLUMN IF NOT EXISTS name text;`); } catch(e) {}

        await client.query(`
            CREATE TABLE IF NOT EXISTS public.server_roles (
                role_id text PRIMARY KEY,
                guild_id text NOT NULL,
                category_id bigint REFERENCES public.role_categories(id) ON DELETE CASCADE,
                created_at timestamp with time zone DEFAULT now()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS public.level_roles (
                guild_id text NOT NULL,
                level integer NOT NULL,
                role_id text NOT NULL,
                PRIMARY KEY (guild_id, level)
            );
        `);

        // 14. Create guild_channels (Hybrid Sorting & Activity Tracking)
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.guild_channels (
                guild_id text NOT NULL,
                channel_id text NOT NULL,
                pinned_position integer DEFAULT -1, -- -1 means not pinned
                last_active_at timestamp with time zone DEFAULT now(),
                PRIMARY KEY (guild_id, channel_id)
            );
        `);

        // 15. PERFORMANCE INDICES
        await client.query(`CREATE INDEX IF NOT EXISTS idx_subs_anilist_id ON public.subscriptions(anilist_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tracked_next_airing ON public.tracked_anime_state(next_airing);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_guild_user ON public.users(guild_id, user_id);`);

        // 14. RELOAD SCHEMA CACHE (Critical for Supabase/PostgREST to see new columns immediately)
        await client.query("NOTIFY pgrst, 'reload schema';");
        
        console.log('Database archives verified. Auto-Migration complete.');
        return true;

    } catch (err) {
        console.warn('Could not connect to the archives (DB Start Failed)');
        console.warn('Reason: ' + err.message);
        return false;
    } finally {
        // Ensure client is closed only if it was connected or attempted
        try { await client.end(); } catch (e) { }
        process.exit(0);
    }
};

initializeDatabase();
