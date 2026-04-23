-- 🛡️ Animuse Security Hardening Migration
-- Goal: Resolve all Supabase Linter warnings (0011, 0024)
-- This migration restricts overly permissive RLS policies to the 'service_role' (bot).

-- 1. Fix Function Search Path (Linter 0011)
-- Ensures the 'add_xp_to_user' function uses a secure search path.
ALTER FUNCTION public.add_xp_to_user(text, text, integer) SET search_path = public;

-- 2. Hardening RLS Policies (Linter 0024)
-- For each table, we ensure RLS is enabled and policies are restricted to 'service_role'.

-- Helper for cleanup: Drop existing permissive policies before recreating them securely.
DO $$ 
BEGIN
    -- 1. Drop common permissive policy names found in previous linter reports
    -- Active Mafia Games
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'active_mafia_games') THEN
        DROP POLICY "Enable all access" ON public.active_mafia_games;
    END IF;

    -- Activity Posted
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on activity_posted' AND tablename = 'activity_posted') THEN
        DROP POLICY "Enable all access for service role on activity_posted" ON public.activity_posted;
    END IF;

    -- Bingo Buffer
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on bingo_buffer' AND tablename = 'bingo_buffer') THEN
        DROP POLICY "Enable all access for service role on bingo_buffer" ON public.bingo_buffer;
    END IF;

    -- Bingo Cards
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'bingo_cards') THEN
        DROP POLICY "Enable all access" ON public.bingo_cards;
    END IF;

    -- Config Layer Roles
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'config_layer_roles') THEN
        DROP POLICY "Enable all access" ON public.config_layer_roles;
    END IF;

    -- Config Layers
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'config_layers') THEN
        DROP POLICY "Enable all access" ON public.config_layers;
    END IF;

    -- Guild Channels
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on guild_channels' AND tablename = 'guild_channels') THEN
        DROP POLICY "Enable all access for service role on guild_channels" ON public.guild_channels;
    END IF;

    -- Guild Configs
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for service_role' AND tablename = 'guild_configs') THEN
        DROP POLICY "Allow all for service_role" ON public.guild_configs;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'guild_configs') THEN
        DROP POLICY "Enable all access" ON public.guild_configs;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on configs' AND tablename = 'guild_configs') THEN
        DROP POLICY "Enable all access for service role on configs" ON public.guild_configs;
    END IF;

    -- Level Roles
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on level_roles' AND tablename = 'level_roles') THEN
        DROP POLICY "Enable all access for service role on level_roles" ON public.level_roles;
    END IF;

    -- Moderation Logs
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on moderation_logs' AND tablename = 'moderation_logs') THEN
        DROP POLICY "Enable all access for service role on moderation_logs" ON public.moderation_logs;
    END IF;

    -- Parent Server Settings
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'parent_server_settings') THEN
        DROP POLICY "Enable all access" ON public.parent_server_settings;
    END IF;

    -- Role Categories
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on role_categories' AND tablename = 'role_categories') THEN
        DROP POLICY "Enable all access for service role on role_categories" ON public.role_categories;
    END IF;

    -- Server Roles
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on server_roles' AND tablename = 'server_roles') THEN
        DROP POLICY "Enable all access for service role on server_roles" ON public.server_roles;
    END IF;

    -- Subscriptions
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on subscriptions' AND tablename = 'subscriptions') THEN
        DROP POLICY "Enable all access for service role on subscriptions" ON public.subscriptions;
    END IF;

    -- Tracked Anime State
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on tracked_anime_state' AND tablename = 'tracked_anime_state') THEN
        DROP POLICY "Enable all access for service role on tracked_anime_state" ON public.tracked_anime_state;
    END IF;

    -- User Favorites
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on user_favorites' AND tablename = 'user_favorites') THEN
        DROP POLICY "Enable all access for service role on user_favorites" ON public.user_favorites;
    END IF;

    -- User Titles
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'user_titles') THEN
        DROP POLICY "Enable all access" ON public.user_titles;
    END IF;

    -- Users
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access' AND tablename = 'users') THEN
        DROP POLICY "Enable all access" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on users' AND tablename = 'users') THEN
        DROP POLICY "Enable all access for service role on users" ON public.users;
    END IF;

    -- 2. Cleanup: Drop the NEW policy name too in case of re-run
    DECLARE
        v_table_name text;
    BEGIN
        FOR v_table_name IN 
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
        LOOP
            IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Full Access' AND tablename = v_table_name) THEN
                EXECUTE format('DROP POLICY "Service Role Full Access" ON public.%I', v_table_name);
            END IF;
        END LOOP;
    END;

END $$;

-- 3. Create SECURE policies (Restricted TO service_role)
-- This satisfies the linter while ensuring the bot has full control.

ALTER TABLE IF EXISTS public.active_mafia_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.active_mafia_games FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.activity_posted ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.activity_posted FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.bingo_buffer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.bingo_buffer FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.bingo_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.bingo_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.config_layer_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.config_layer_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.config_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.config_layers FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.guild_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.guild_channels FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.guild_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.guild_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.level_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.level_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.moderation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.moderation_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.parent_server_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.parent_server_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.role_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.role_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.server_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.server_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.tracked_anime_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.tracked_anime_state FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.user_favorites FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.user_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.user_titles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.welcome_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.welcome_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.activity_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.activity_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.mafia_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON public.mafia_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Also fix archive_stats just in case
ALTER TABLE IF EXISTS public.archive_stats ENABLE ROW LEVEL SECURITY;
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on archive_stats' AND tablename = 'archive_stats') THEN
        DROP POLICY "Enable all access for service role on archive_stats" ON public.archive_stats;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Full Access' AND tablename = 'archive_stats') THEN
        DROP POLICY "Service Role Full Access" ON public.archive_stats;
    END IF;
END $$;
CREATE POLICY "Service Role Full Access" ON public.archive_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 📜 ARCHIVIST NOTE:
-- This migration effectively silences the Supabase linter warnings by ensuring
-- that 'ALL' operations are restricted to the service_role. 
-- Public read (SELECT) can still be added via separate policies if needed.
