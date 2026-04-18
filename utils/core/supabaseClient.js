const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('./logger');

/**
 * ⚠️  SECURITY NOTE — SERVICE ROLE KEY
 * SUPABASE_KEY must be the `service_role` JWT.
 * This key bypasses Row Level Security (RLS) and has full DB superuser access.
 * It is intentionally used here for server-side admin operations only.
 * NEVER expose this key in client-side code or public-facing endpoints.
 *
 * Key role can be verified by decoding the JWT payload:
 *   { "role": "service_role", ... }  ← correct for this file
 *   { "role": "anon", ... }          ← WRONG — will cause silent permission failures
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Must be service_role key

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
