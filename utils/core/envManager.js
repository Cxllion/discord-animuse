const { z } = require('zod');
const logger = require('./logger');

const envSchema = z.object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
    DATABASE_URL: z.string().url().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a valid PostgreSQL connection string"),
    SUPABASE_URL: z.string().url().startsWith('https://', "SUPABASE_URL must start with https://"),
    SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),
    ANILIST_CLIENT_ID: z.string().optional(),
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
    
    if (!process.env.ANILIST_CLIENT_ID) {
        logger.warn('ANILIST_CLIENT_ID not set. Some features may be limited.', 'Startup');
    }
    
    return parsed.data;
};

module.exports = { validateEnv, envSchema };
