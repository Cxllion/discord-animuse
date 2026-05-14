require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
    console.log('🚀 Setting up Tic Tac Toe Schema...');
    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const sql = `
            CREATE TABLE IF NOT EXISTS public.tictactoe_sessions (
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
                last_move_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                history JSONB DEFAULT '[]'::jsonb,
                last_move_coord JSONB,
                guild_id TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS public.tictactoe_history (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                player1_id TEXT NOT NULL,
                player2_id TEXT NOT NULL,
                winner_id TEXT,
                date DATE NOT NULL,
                points_awarded INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE public.tictactoe_sessions ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.tictactoe_history ENABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS "Enable all access for service role on tictactoe_sessions" ON public.tictactoe_sessions;
            CREATE POLICY "Enable all access for service role on tictactoe_sessions" ON public.tictactoe_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

            DROP POLICY IF EXISTS "Enable all access for service role on tictactoe_history" ON public.tictactoe_history;
            CREATE POLICY "Enable all access for service role on tictactoe_history" ON public.tictactoe_history FOR ALL TO service_role USING (true) WITH CHECK (true);

            NOTIFY pgrst, 'reload schema';
        `;
        await client.query(sql);
        console.log('✅ Tic Tac Toe Schema updated successfully.');
    } catch (err) {
        console.error('❌ Update failed:', err);
    } finally {
        await client.end().catch(() => {});
    }
}

migrate();
