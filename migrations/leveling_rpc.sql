-- 🎭 Animuse Archive Migration: Leveling Optimization (RPC)
-- Goal: Reduce round-trips to Supabase for XP updates.

-- Step 1: Create the 'add_xp' function
-- This function handles the "Sync and Upsert" logic in a single atomic transaction.

CREATE OR REPLACE FUNCTION add_xp_to_user(
    p_user_id TEXT,
    p_guild_id TEXT,
    p_xp_to_add INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_xp INT := 0;
    v_old_level INT := 0;
    v_new_xp INT := 0;
    v_new_level INT := 0;
    v_result JSONB;
BEGIN
    -- 1. Fetch current data
    SELECT xp, level INTO v_old_xp, v_old_level
    FROM users
    WHERE user_id = p_user_id AND guild_id = p_guild_id;

    -- 2. Calculate new values
    v_new_xp := COALESCE(v_old_xp, 0) + p_xp_to_add;
    
    -- Level Formula: Floor(0.1 * Sqrt(XP))
    v_new_level := FLOOR(0.1 * SQRT(v_new_xp));

    -- 3. Upsert the data
    INSERT INTO users (user_id, guild_id, xp, level, last_message)
    VALUES (p_user_id, p_guild_id, v_new_xp, v_new_level, NOW())
    ON CONFLICT (user_id, guild_id)
    DO UPDATE SET 
        xp = EXCLUDED.xp, 
        level = EXCLUDED.level, 
        last_message = EXCLUDED.last_message;

    -- 4. Package response for the bot
    v_result := jsonb_build_object(
        'old_level', v_old_level,
        'new_level', v_new_level,
        'new_xp', v_new_xp
    );

    RETURN v_result;
END;
$$;

-- 📜 ARCHIVIST NOTE:
-- To deploy this optimization:
-- 1. Copy the SQL above.
-- 2. Paste it into your Supabase SQL Editor.
-- 3. Run it once.
-- 4. Animuse will now use the single-query 'rpc' call for leveling!
