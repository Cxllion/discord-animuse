const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('./logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    logger.warn('⚠️ Supabase credentials missing. Database features will not work.', 'SupabaseClient');
    supabase = null;
}

module.exports = supabase;
