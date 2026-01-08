const { loadCommands, loadEvents } = require('./loader');
const { initializeDatabase } = require('./database');
const supabase = require('./supabaseClient');
const logger = require('./logger');

const initializeBot = async (client) => {
    // 1. Load Systems
    logger.info('Organizing the library shelves...', 'Init');
    loadCommands(client);
    loadEvents(client);

    // 2. Init DB
    logger.info('Dusting off the archives...', 'Init');
    const dbSuccess = await initializeDatabase();

    if (!dbSuccess) {
        client.isOfflineMode = true;
        logger.warn('⚠️ Archives are inaccessible. Starting in [OFFLINE MODE].', 'Init');
        logger.warn('   - Profiles, Leaderboards, and Settings will be unavailable.', 'Init');
    } else {
        client.isOfflineMode = false;

        // 3. Verify Connection (Supabase Client)
        if (supabase) {
            const { error } = await supabase.from('guild_configs').select('*').limit(1);
            if (error) {
                logger.warn('Oh dear, it seems I cannot reach the archives at the moment. (Supabase Unreachable)', 'Database');
                // We don't force offline mode here if migration passed, but it's likely related.
                // But let's keep it safe.
            } else {
                logger.info('The records for this wing of the library have been successfully updated, Manager. (DB Connected)', 'Database');
            }
        } else {
            logger.warn('Supabase client not initialized.', 'Database');
        }
    }
};

module.exports = { initializeBot };
