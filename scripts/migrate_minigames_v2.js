const supabase = require('../utils/core/supabaseClient');
const logger = require('../utils/core/logger');

/**
 * Migration Script: Minigame Backend V2 (Arcade Protocol)
 * Sets up the foundation for multi-game point tracking and global standings.
 */
async function migrate() {
    console.log('🚀 Initiating Minigame Migration V2...');

    if (!supabase) {
        console.error('❌ Supabase client not initialized. Check your environment variables.');
        return;
    }

    // 1. Create minigame_scores (Global Standings) if not exists
    // 2. Create minigame_stats (Per-Game Records)
    // 3. Create wordle_daily and wordle_history (if missing)

    const sql = `
    -- Global standings for the leaderboard
    CREATE TABLE IF NOT EXISTS public.minigame_scores (
        user_id TEXT PRIMARY KEY,
        total_points BIGINT DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Specific stats for each game type
    CREATE TABLE IF NOT EXISTS public.minigame_stats (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        high_score BIGINT DEFAULT 0,
        total_plays INTEGER DEFAULT 1,
        metadata JSONB DEFAULT '{}'::jsonb,
        last_played TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, game_id)
    );

    -- Wordle specific tables (Foundation)
    CREATE TABLE IF NOT EXISTS public.wordle_daily (
        date DATE PRIMARY KEY,
        word TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.wordle_history (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        date DATE NOT NULL,
        guesses INTEGER DEFAULT 0,
        solved BOOLEAN DEFAULT FALSE,
        solved_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(user_id, date)
    );

    -- RLS Policies (Basic hardening for bot access)
    ALTER TABLE public.minigame_scores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.minigame_stats ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.wordle_daily ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.wordle_history ENABLE ROW LEVEL SECURITY;

    -- Note: Policies should be set to allow service_role bypass or specific bot user access.
    -- Assuming Supabase defaults or existing policies handle bot-level access.
    `;

    console.log('⚠️ Please execute the following SQL in your Supabase Dashboard SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(sql);
    console.log('--------------------------------------------------');
    
    console.log('✅ Migration instructions generated. Once executed, the new Arcade Protocol will be active.');
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
});
