require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
    console.log('🚀 Updating Connect4 Schema for Phase 4 features...');
    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const sql = `
        ALTER TABLE public.connect4_sessions ADD COLUMN IF NOT EXISTS last_move_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        ALTER TABLE public.connect4_sessions ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.connect4_sessions ADD COLUMN IF NOT EXISTS last_move_coord JSONB;
        
        -- Add wins/losses to minigame_stats metadata if we want easy access
        -- But we can also calculate from history. For now, just session updates.

        NOTIFY pgrst, 'reload schema';
        `;
        await client.query(sql);
        console.log('✅ Schema updated.');
    } catch (err) {
        console.error('❌ Update failed:', err);
    } finally {
        await client.end().catch(() => {});
    }
}

migrate();
