const { loadCommands, loadEvents } = require('./loader');
const supabase = require('./supabaseClient');
const logger = require('./logger');

/**
 * 1. Load Resources (Synchronous/Fast)
 * This should be called before client.login() to ensure events are bound.
 */
const loadCoreResources = (client) => {
    logger.info('Organizing the library shelves...', 'Init');
    loadCommands(client);
    loadEvents(client);
};

/**
 * 3. Database Heartbeat (Recovery)
 * Periodically checks for database connectivity if the bot started in Offline Mode.
 */
const startDatabaseHeartbeat = (client) => {
    if (client._dbHeartbeat) clearInterval(client._dbHeartbeat);
    
    client._dbHeartbeat = setInterval(async () => {
        if (!client.isOfflineMode || !supabase) return;
        
        try {
            // Lean check
            const { error } = await supabase.from('guild_configs').select('guild_id').limit(1);
            if (!error || error.code === 'PGRST116') {
                client.isOfflineMode = false;
                logger.info('✨ [Heartbeat] Database connection RESTORED. Archives are now back online! ♡', 'Database');
                clearInterval(client._dbHeartbeat);
            }
        } catch (e) {
            // Still unreachable
        }
    }, 60000); 
    
    // Ensure it doesn't block process exit if needed
    if (client._dbHeartbeat.unref) client._dbHeartbeat.unref();
};

const initializeDatabase = async (client) => {
    logger.info('Dusting off the archives...', 'Init');
    
    if (!supabase) {
        client.isOfflineMode = true;
        logger.warn('Supabase client not initialized. Starting in OFFLINE MODE.', 'Database');
        return;
    }

    try {
        // Guarantee startup by wrapping Supabase check in a 25s timeout
        const checkConnection = () => {
            return new Promise(async (resolve) => {
                const timer = setTimeout(() => resolve({ timeout: true }), 25000);
                try {
                    const { error } = await supabase.from('guild_configs').select('guild_id').limit(1);
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
            logger.warn('⚠️ Supabase wake-up timed out (25s). Archives are currently in [OFFLINE MODE].', 'Init');
            startDatabaseHeartbeat(client);
        } else if (result.error && result.error.code !== 'PGRST116') {
            client.isOfflineMode = true;
            logger.warn('⚠️ Archives are inaccessible. Starting in [OFFLINE MODE].', 'Init');
            logger.warn(`Reason: ${result.error.message}`, 'Init');
            startDatabaseHeartbeat(client);
        } else {
            client.isOfflineMode = false;
            logger.debug('The records for this wing of the library have been successfully updated. (DB Connected)', 'Database');
        }
    } catch (err) {
        client.isOfflineMode = true;
        logger.warn('⚠️ Critical database initialization error. Using [OFFLINE MODE].', 'Init');
        logger.warn(`Reason: ${err.message}`, 'Init');
        startDatabaseHeartbeat(client);
    }
};

module.exports = { loadCoreResources, initializeDatabase };
