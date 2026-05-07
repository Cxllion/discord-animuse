-- 🛡️ Connect4 Security Hardening
-- Goal: Ensure RLS is enabled and secure policies exist for Connect4 tables

-- 1. Enable RLS (Ensure it's enabled even if previously done)
ALTER TABLE IF EXISTS public.connect4_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.connect4_history ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing permissive policies if any
DO $$ 
BEGIN
    -- Sessions
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on connect4_sessions' AND tablename = 'connect4_sessions') THEN
        DROP POLICY "Enable all access for service role on connect4_sessions" ON public.connect4_sessions;
    END IF;
    
    -- History
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for service role on connect4_history' AND tablename = 'connect4_history') THEN
        DROP POLICY "Enable all access for service role on connect4_history" ON public.connect4_history;
    END IF;
END $$;

-- 3. Create SECURE policies (Restricted TO service_role)
-- This ensures the bot has full access while satisfying the Supabase linter.

DO $$ 
BEGIN
    -- Sessions
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'connect4_sessions' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Enable all access for service role on connect4_sessions" ON public.connect4_sessions;
        CREATE POLICY "Enable all access for service role on connect4_sessions" ON public.connect4_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    -- History
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'connect4_history' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "Enable all access for service role on connect4_history" ON public.connect4_history;
        CREATE POLICY "Enable all access for service role on connect4_history" ON public.connect4_history FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
