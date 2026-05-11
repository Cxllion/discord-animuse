const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('../config');
const logger = require('./logger');

/**
 * 📚 [Supabase Architecture]
 * We maintain two clients to enforce the Principle of Least Privilege:
 * 1. serviceClient: Bypasses RLS. Use ONLY for admin/backend tasks.
 * 2. anonClient: Respects RLS. Use for all user-facing read/write operations.
 */

const { URL, SERVICE_KEY, ANON_KEY } = CONFIG.SUPABASE;

let serviceClient = null;
let anonClient = null;

if (URL && SERVICE_KEY) {
    // 1. Privileged Client (Service Role)
    serviceClient = createClient(URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // 2. Unprivileged Client (Anon Key)
    // If ANON_KEY is provided, we use it to respect RLS.
    anonClient = createClient(URL, ANON_KEY || SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
} else {
    logger.error('❌ Supabase credentials missing. Archives are locked.', 'SupabaseClient');
}

/**
 * Exports both clients.
 * Default export remains the serviceClient for legacy compatibility.
 */
module.exports = serviceClient;
module.exports.serviceClient = serviceClient;
module.exports.anonClient = anonClient;

