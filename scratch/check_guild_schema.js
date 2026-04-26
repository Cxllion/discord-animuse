const supabase = require('../utils/core/supabaseClient');

async function checkGuildConfigs() {
    if (!supabase) {
        console.error('Supabase client not initialized.');
        return;
    }

    const { data, error } = await supabase
        .from('guild_configs')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching guild_configs:', error);
    } else if (data && data.length > 0) {
        console.log('Columns in guild_configs:', Object.keys(data[0]));
    } else {
        console.log('No data in guild_configs to check columns.');
        // Try to get schema via RPC or just fetch a non-existent row
        const { error: schemaError } = await supabase
            .from('guild_configs')
            .select('suggestions_channel_id')
            .limit(1);
        
        if (schemaError) {
            console.log('suggestions_channel_id exists?', !schemaError.message.includes('column "suggestions_channel_id" does not exist'));
            console.log('Schema Error Message:', schemaError.message);
        } else {
            console.log('suggestions_channel_id exists!');
        }
    }
}

checkGuildConfigs();
