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
            // Guarantee startup by wrapping Supabase check in a 25s timeout
            const checkConnection = () => {
                return new Promise(async (resolve) => {
                    const timer = setTimeout(() => resolve({ timeout: true }), 25000);
                    try {
                        const { error } = await supabase.from('guild_configs').select('*').limit(1);
                        clearTimeout(timer);
                        resolve({ error });
                    } catch (e) {
                        clearTimeout(timer);
                        resolve({ error: e });
                    }
                });
            };

            const result = await checkConnection();
            
            if (result.timeout) {
                client.isOfflineMode = true;
                logger.warn('⚠️ Supabase wake-up timed out (25s). Starting in [OFFLINE MODE].', 'Init');
            } else if (result.error && result.error.code !== 'PGRST116') {
                client.isOfflineMode = true;
                logger.warn('⚠️ Archives are inaccessible. Starting in [OFFLINE MODE].', 'Init');
                logger.warn(`Reason: ${result.error.message}`, 'Init');
            } else {
                client.isOfflineMode = false;
                logger.debug('The records for this wing of the library have been successfully updated, Manager. (DB Connected)', 'Database');
            }
        } catch (err) {
            client.isOfflineMode = true;
            logger.warn('⚠️ Critical initialization error. Starting in [OFFLINE MODE].', 'Init');
            logger.warn(`Reason: ${err.message}`, 'Init');
        }
    } else {
        client.isOfflineMode = true;
        logger.warn('Supabase client not initialized. Starting in OFFLINE MODE.', 'Database');
    }
};

module.exports = { initializeBot };
