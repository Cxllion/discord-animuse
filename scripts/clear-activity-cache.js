/**
 * One-time script to clear all activity_posted records from the last 72 hours.
 * This forces all recent activities to be rebroadcast on the next scheduler run.
 * 
 * Usage: node scripts/clear-activity-cache.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Also clear the local JSON file cache
const CACHE_PATH = path.join(__dirname, '../.activity_posted_cache.json');

async function clearRecentActivityCache() {
    console.log('🧹 Clearing activity_posted records from the last 72 hours...\n');

    // 1. Clear DB records from the last 72 hours (keep older ones, they won't be re-fetched anyway)
    const { data, error, count } = await supabase
        .from('activity_posted')
        .delete({ count: 'exact' })
        .gt('posted_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

    if (error) {
        console.error('❌ Supabase delete failed:', error.message);
    } else {
        console.log(`✅ Supabase: Cleared ${count ?? 'unknown number of'} records from activity_posted.\n`);
    }

    // 2. Delete the local file cache
    if (fs.existsSync(CACHE_PATH)) {
        fs.writeFileSync(CACHE_PATH, JSON.stringify({}), 'utf-8');
        console.log(`✅ Local file cache cleared: ${CACHE_PATH}\n`);
    } else {
        console.log(`ℹ️  No local file cache found at ${CACHE_PATH} — skipping.\n`);
    }

    console.log('🚀 Done! The bot will rebroadcast all activities from the last 72 hours on the next scheduler run.');
    process.exit(0);
}

clearRecentActivityCache().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
