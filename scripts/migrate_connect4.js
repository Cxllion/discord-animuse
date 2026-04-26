require('dotenv').config();
const { Client } = require('pg');

/**
 * Migration Script: Connect4 Arcade Protocol (Direct Postgres Execution)
 * Sets up the history and session tables for Connect4 multiplayer logic.
 */
async function migrate() {
    console.log('🚀 Initiating Connect4 Database Migration...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL missing in environment. Cannot execute direct migration.');
        console.log('Please execute the following SQL manually in your Supabase Dashboard:');
        console.log(`
        CREATE TABLE IF NOT EXISTS public.connect4_sessions (
            id TEXT PRIMARY KEY,
            player1 TEXT NOT NULL,
            player2 TEXT NOT NULL,
            board JSONB NOT NULL,
            current_turn TEXT,
            status TEXT DEFAULT 'PLAYING',
            winner TEXT,
            winning_tiles JSONB DEFAULT '[]'::jsonb,
            moves INTEGER DEFAULT 0,
            public_message_id TEXT,
            public_channel_id TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.connect4_history (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            player1_id TEXT NOT NULL,
            player2_id TEXT NOT NULL,
            winner_id TEXT,
            date DATE NOT NULL,
            points_awarded INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        `);
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('🔗 Connected to Postgres Archives...');

        const sql = `
        -- Connect4 Active Session Tracking
        CREATE TABLE IF NOT EXISTS public.connect4_sessions (
            id TEXT PRIMARY KEY,
            player1 TEXT NOT NULL,
            player2 TEXT NOT NULL,
            board JSONB NOT NULL,
            current_turn TEXT,
            status TEXT DEFAULT 'PLAYING',
            winner TEXT,
            winning_tiles JSONB DEFAULT '[]'::jsonb,
            moves INTEGER DEFAULT 0,
            public_message_id TEXT,
            public_channel_id TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Connect4 History & Reward Tracking (Daily Limits per opponent)
        CREATE TABLE IF NOT EXISTS public.connect4_history (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            player1_id TEXT NOT NULL,
            player2_id TEXT NOT NULL,
            winner_id TEXT,
            date DATE NOT NULL,
            points_awarded INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Security Hardening
        ALTER TABLE public.connect4_sessions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.connect4_history ENABLE ROW LEVEL SECURITY;

        -- Reload PostgREST Schema Cache
        NOTIFY pgrst, 'reload schema';
        `;

        await client.query(sql);
        console.log('✅ Connect4 Arcade Tables Synchronized Successfully.');

    } catch (err) {
        console.error('❌ Migration failure:', err);
    } finally {
        await client.end().catch(() => {});
    }
}

migrate();
