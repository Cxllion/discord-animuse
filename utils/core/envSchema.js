const { z } = require('zod');
const dotenv = require('dotenv');

// Load .env files
dotenv.config();

/**
 * AniMuse Environment Schema
 * Validates and parses process.env into a typed object.
 */
const envSchema = z.object({
    // --- DISCORD ---
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    TEST_DISCORD_TOKEN: z.string().optional(),
    CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
    TEST_CLIENT_ID: z.string().optional(),
    GUILD_ID: z.string().optional(),
    TESTER_ROLE_ID: z.string().optional(),

    // --- DATABASE ---
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres URL"),
    SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
    SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),

    // --- ANILIST ---
    ANILIST_CLIENT_ID: z.string().optional(),
    ANILIST_CLIENT_SECRET: z.string().optional(),
    ANILIST_TIMEOUT: z.string().default('15000').transform(val => parseInt(val, 10)),

    // --- LOGGING & OPS ---
    PORT: z.string().default('3000').transform(val => parseInt(val, 10)),
    LOGS_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
    DEPLOY_ON_START: z.string().default('false').transform(val => val === 'true'),
    DEBUG: z.string().default('false').transform(val => val === 'true'),
    DISABLE_INTERNAL_SCHEDULER: z.string().default('false').transform(val => val === 'true'),
    TEST_MODE: z.string().default('false').transform(val => val === 'true'),
    ENABLE_SHARDING: z.string().default('false').transform(val => val === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

module.exports = parsed.data;
