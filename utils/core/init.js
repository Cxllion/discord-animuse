const { loadCommands, loadEvents } = require('./loader');
const supabase = require('./supabaseClient');
const logger = require('./logger');

const initializeBot = async (client) => {
    // 1. Load Systems
    logger.info('Organizing the library shelves...', 'Init');
    loadCommands(client);
    loadEvents(client);

    // 2. Verify Connection (Supabase Client)
    logger.info('Dusting off the archives...', 'Init');
    if (supabase) {
        try {
            // Add a 10s timeout to prevent indefinite hanging if Supabase is paused/unreachable
            const pingPromise = supabase.from('guild_configs').select('*').limit(1);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Supabase connection timed out')), 10000)
            );

            const { error } = await Promise.race([pingPromise, timeoutPromise]);
            
            if (error && error.code !== 'PGRST116') {
                client.isOfflineMode = true;
                logger.warn('⚠️ Archives are inaccessible. Starting in [OFFLINE MODE].', 'Init');
                logger.warn(`Reason: ${error.message}`, 'Init');
            } else {
                client.isOfflineMode = false;
                logger.debug('The records for this wing of the library have been successfully updated, Manager. (DB Connected)', 'Database');
            }
        } catch (err) {
            client.isOfflineMode = true;
            logger.warn('⚠️ Archives are inaccessible (Timeout/Error). Starting in [OFFLINE MODE].', 'Init');
            logger.warn(`Reason: ${err.message}`, 'Init');
        }
    } else {
        client.isOfflineMode = true;
        logger.warn('Supabase client not initialized. Starting in OFFLINE MODE.', 'Database');
    }
};

module.exports = { initializeBot };
