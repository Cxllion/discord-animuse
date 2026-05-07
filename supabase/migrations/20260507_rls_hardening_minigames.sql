-- 🛡️ Minigame Security Hardening
-- Goal: Enable RLS on minigame tables and restrict to service_role

-- 1. Enable RLS
ALTER TABLE IF EXISTS public.minigame_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.minigame_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wordle_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wordle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wordle_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing permissive policies if any (standardizing on 'Service Role Full Access')
DO $$ 
BEGIN
    -- Minigame Scores
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Full Access' AND tablename = 'minigame_scores') THEN
        DROP POLICY "Service Role Full Access" ON public.minigame_scores;
    END IF;
    
    -- Minigame Stats
    IF EXISTS (SELECT 1 FROM pg_policies WHERE (policyname = 'Service Role Full Access' OR policyname = 'Enable all access for service role on minigame_stats') AND tablename = 'minigame_stats') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Access" ON public.minigame_stats';
        EXECUTE 'DROP POLICY IF EXISTS "Enable all access for service role on minigame_stats" ON public.minigame_stats';
    END IF;

    -- Wordle Daily
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Full Access' AND tablename = 'wordle_daily') THEN
        DROP POLICY "Service Role Full Access" ON public.wordle_daily;
    END IF;

    -- Wordle History
    IF EXISTS (SELECT 1 FROM pg_policies WHERE (policyname = 'Service Role Full Access' OR policyname = 'Enable all access for service role on wordle_history') AND tablename = 'wordle_history') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Access" ON public.wordle_history';
        EXECUTE 'DROP POLICY IF EXISTS "Enable all access for service role on wordle_history" ON public.wordle_history';
    END IF;

    -- Wordle Sessions
    IF EXISTS (SELECT 1 FROM pg_policies WHERE (policyname = 'Service Role Full Access' OR policyname = 'Enable all access for service role on wordle_sessions') AND tablename = 'wordle_sessions') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Service Role Full Access" ON public.wordle_sessions';
        EXECUTE 'DROP POLICY IF EXISTS "Enable all access for service role on wordle_sessions" ON public.wordle_sessions';
    END IF;
END $$;

-- 3. Create SECURE policies (Restricted TO service_role)
-- This ensures the bot has full access while satisfying the Supabase linter.

DO $$ 
BEGIN
    -- Minigame Scores
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'minigame_scores' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Service Role Full Access" ON public.minigame_scores;
        CREATE POLICY "Service Role Full Access" ON public.minigame_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    -- Minigame Stats
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'minigame_stats' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Service Role Full Access" ON public.minigame_stats;
        CREATE POLICY "Service Role Full Access" ON public.minigame_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    -- Wordle Daily
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'wordle_daily' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Service Role Full Access" ON public.wordle_daily;
        CREATE POLICY "Service Role Full Access" ON public.wordle_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    -- Wordle History
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'wordle_history' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Service Role Full Access" ON public.wordle_history;
        CREATE POLICY "Service Role Full Access" ON public.wordle_history FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    -- Wordle Sessions
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'wordle_sessions' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Service Role Full Access" ON public.wordle_sessions;
        CREATE POLICY "Service Role Full Access" ON public.wordle_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
