const supabase = require('../utils/core/supabaseClient');

async function testStorage() {
    if (!supabase) {
        console.log('Supabase not initialized');
        return;
    }
    try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) {
            console.error('Error listing buckets:', error);
        } else {
            console.log('Buckets:', data);
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

testStorage();
