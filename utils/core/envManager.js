const { z } = require('zod');
const logger = require('./logger');

const envSchema = z.object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    TEST_DISCORD_TOKEN: z.string().optional(),
    CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
    TEST_CLIENT_ID: z.string().optional(),
    DATABASE_URL: z.string().url().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a valid PostgreSQL connection string").optional(),
    SUPABASE_URL: z.string().url().startsWith('https://', "SUPABASE_URL must start with https://"),
    SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required (must be service_role key)"),
    ANILIST_CLIENT_ID: z.string().optional(),
    ANILIST_CLIENT_SECRET: z.string().optional(),
    // Access control — required for test bot to respond to any interactions
    TESTER_ROLE_ID: z.string().optional(),
    // Optional developer webhook for critical error alerts
    LOGS_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
    DISABLE_INTERNAL_SCHEDULER: z.enum(['true', 'false']).optional(),
    PORT: z.string().optional()
});

const validateEnv = () => {
    const parsed = envSchema.safeParse(process.env);
    
    if (!parsed.success) {
        logger.error('Environment validation failed:', null, 'Startup');
        parsed.error.errors.forEach(err => {
            logger.error(`- ${err.path.join('.')}: ${err.message}`, null, 'Startup');
        });
        process.exit(1);
    }
    
    if (!process.env.DATABASE_URL) {
        logger.warn('DATABASE_URL not set. Manual migrations will not work, but the bot will run using Supabase.', 'Startup');
    }
    
    if (!process.env.ANILIST_CLIENT_ID) {
        logger.warn('ANILIST_CLIENT_ID not set. Some features may be limited.', 'Startup');
    }
    
    return parsed.data;
};

module.exports = { validateEnv, envSchema };
