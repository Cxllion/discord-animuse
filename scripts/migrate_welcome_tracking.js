require('dotenv').config();
const { Client } = require('pg');

const migrateWelcomeTracking = async () => {
    if (!process.env.DATABASE_URL) {
        console.warn('DATABASE_URL missing. Skipping migration.');
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to Postgres for Welcome Tracking migration...');

        // Create welcome_tracking table
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.welcome_tracking (
                user_id text NOT NULL,
                guild_id text NOT NULL,
                welcome_msg_id text,
                welcome_channel_id text,
                greeting_msg_id text,
                greeting_channel_id text,
                has_spoken boolean DEFAULT false,
                joined_at timestamp with time zone DEFAULT now(),
                PRIMARY KEY (user_id, guild_id)
            );
            ALTER TABLE public.welcome_tracking ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for service role on welcome_tracking" ON public.welcome_tracking;
            CREATE POLICY "Enable all access for service role on welcome_tracking" ON public.welcome_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);
        `);

        console.log('Welcome Tracking migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

migrateWelcomeTracking();
