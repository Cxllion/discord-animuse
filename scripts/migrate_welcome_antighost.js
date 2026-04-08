require('dotenv').config();
const { Client } = require('pg');

const migrateWelcomeAntiGhost = async () => {
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
        console.log('Connected to Postgres for Welcome Anti-Ghost migration...');

        // Add Anti-Ghost Toggle
        await client.query(`ALTER TABLE public.guild_configs ADD COLUMN IF NOT EXISTS welcome_antighost_enabled boolean DEFAULT true;`);

        console.log('Welcome Anti-Ghost migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

migrateWelcomeAntiGhost();
