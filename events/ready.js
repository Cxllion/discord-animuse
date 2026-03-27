const { Events } = require('discord.js');
const { checkAiringAnime, checkUserActivity } = require('../utils/services/scheduler');
const { deployCommands } = require('../utils/core/commandDeployer');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`Ready! Logged in as ${client.user.tag}`, 'System');
        logger.info(`Animuse is now online and serving in ${client.guilds.cache.size} guilds.`, 'System');

        // Clear Caches to ensure V3 visuals are immediate
        const { flushAniListCache } = require('../utils/services/anilistService');
        flushAniListCache();

        // Set Presence
        client.user.setPresence({
            activities: [{ name: 'Watching the Library...', type: 3 }], // Type 3 is WATCHING
            status: 'online'
        });

        // Deploy Commands (Conditional)
        const shouldDeploy = process.env.DEPLOY_ON_START === 'true';
        if (shouldDeploy) {
            try {
                await deployCommands(client);
            } catch (e) {
                logger.error('Command deployment failure:', e, 'Deployer');
            }
        } else {
            logger.info('Command deployment skipped (DEPLOY_ON_START=false)', 'Deployer');
        }

        client.isSystemsGo = true;

        try {
            require('../utils/archive/ArchiveManager').loadState(client);
        } catch (e) {
            logger.error('Failed to load archive state:', e);
        }

        // ── Dedup Table Probe (Render-safe check) ───────────────────────────
        try {
            const supabase = require('../utils/core/supabaseClient');
            const { error } = await supabase.from('activity_posted').select('activity_id').limit(1);
            if (!error) {
                logger.info('✅ [Activity Dedup] Supabase `activity_posted` table FOUND — persistent dedup is ACTIVE. Render-safe! ♡', 'System');
            } else {
                logger.warn('⚠️ [Activity Dedup] Supabase `activity_posted` table NOT FOUND — falling back to local file cache. Run the migration script to activate persistent dedup.', 'System');
            }
        } catch (e) {
            logger.warn('⚠️ [Activity Dedup] Could not reach Supabase for migration probe.', 'System');
        }

        if (process.env.DISABLE_INTERNAL_SCHEDULER !== 'true') {
            setTimeout(async () => {
                logger.info('Initializing scheduler polling (5m cycles)...', 'System');
                
                // Runs immediately on startup (after 10s delay)
                await checkAiringAnime(client).catch(e => logger.error('Initial check crash:', e, 'Scheduler'));
                await checkUserActivity(client).catch(e => logger.error('Initial check crash:', e, 'Scheduler'));

                setInterval(async () => {
                    try {
                        await checkAiringAnime(client);
                        await checkUserActivity(client);
                    } catch (error) {
                        logger.error('Notification loop failure:', error, 'Scheduler');
                    }
                }, 5 * 60 * 1000); 
            }, 10000);
        } else {
            logger.info('Internal Scheduler disabled. Assuming external cron via worker.js', 'System');
        }

    },
};
