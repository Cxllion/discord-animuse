const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('../config');
const logger = require('./logger');

/**
 * ⚠️  SECURITY NOTE — SERVICE ROLE KEY
 * SUPABASE_KEY must be the `service_role` JWT.
 * This key bypasses Row Level Security (RLS) and has full DB superuser access.
 */
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_KEY; // Must be service_role key

let supabase;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
        db: { schema: 'public' },
        auth: { persistSession: false, autoRefreshToken: false }
    });
} else {
    logger.warn('⚠️ Supabase credentials missing. Database features will not work.', 'SupabaseClient');
    supabase = null;
}

module.exports = supabase;
