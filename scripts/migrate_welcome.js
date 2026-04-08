require('dotenv').config();
const { Client } = require('pg');

const migrateWelcome = async () => {
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
        console.log('Connected to Postgres for Welcome migration...');

        // Add Welcome Configuration Columns
        await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS welcome_message text;`);
        await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS greeting_messages text[] DEFAULT '{}';`);
        await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS welcome_dm_briefing boolean DEFAULT true;`);

        console.log('Welcome migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

migrateWelcome();
