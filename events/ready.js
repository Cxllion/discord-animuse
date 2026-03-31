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
        const { clearConfigCache } = require('../utils/services/guildConfigService');
        flushAniListCache();
        clearConfigCache();

        // ── Dynamic Presence Rotation ─────────────────────────────────────────
        const activities = [
            { name: 'the Library Archives...', type: 3 }, // WATCHING
            { name: 'AniList Airing Ticker...', type: 3 },
            { name: 'the rustle of digital pages...', type: 2 }, // LISTENING
            { name: 'Categorizing new memories...', type: 0 }, // PLAYING
            { name: 'vibrant HUD statistics...', type: 3 }
        ];

        let activityIndex = 0;
        const updatePresence = () => {
            const act = activities[activityIndex];
            client.user.setPresence({
                activities: [{ name: act.name, type: act.type }],
                status: 'online'
            });
            activityIndex = (activityIndex + 1) % activities.length;
        };

        updatePresence(); // Set initial
        setInterval(updatePresence, 60 * 1000); // Rotate every minute


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

        if (!client.isTestBot) {
            try {
                require('../utils/archive/ArchiveManager').loadState(client);
            } catch (e) {
                logger.error('Failed to load archive state:', e);
            }
        } else {
            logger.info('Test bot detected. Global game state restoration skipped.', 'System');
        }

        // ── Start Component Task Schedulers ─────────────────────────────────────────

        // ── Dedup Table Probe (Render-safe check) ───────────────────────────
        try {
            const supabase = require('../utils/core/supabaseClient');
            
            // Safety: Wrap the probe in a 15s timeout so the Ready event finishes even if DB is slow
            const probeDatabase = () => {
                return new Promise(async (resolve) => {
                    const timer = setTimeout(() => resolve({ timeout: true }), 15000);
                    try {
                        const { error } = await supabase.from('activity_posted').select('activity_id').limit(1);
                        clearTimeout(timer);
                        resolve({ error });
                    } catch (e) {
                        clearTimeout(timer);
                        resolve({ error: e });
                    }
                });
            };

            const result = await probeDatabase();

            if (result.timeout) {
                logger.warn('⚠️ [Activity Dedup] Supabase probe timed out (15s). Ready event finishing without confirmation.', 'System');
            } else if (!result.error) {
                logger.info('✅ [Activity Dedup] Supabase `activity_posted` table FOUND — persistent dedup is ACTIVE. Render-safe! ♡', 'System');
            } else {
                logger.warn('⚠️ [Activity Dedup] Supabase `activity_posted` table NOT FOUND — falling back to local file cache. Run the migration script to activate persistent dedup.', 'System');
            }
        } catch (e) {
            logger.warn('⚠️ [Activity Dedup] Could not reach Supabase for migration probe (Internal Error).', 'System');
        }

        if (process.env.DISABLE_INTERNAL_SCHEDULER !== 'true') {
            setTimeout(async () => {
                logger.info('Initializing scheduler polling (5m cycles)...', 'System');
                
                // Runs immediately on startup (after 10s delay)
                checkAiringAnime(client).catch(e => logger.error('[Scheduler] Initial Airing crash:', e));
                
                if (!client.isTestBot) {
                    checkUserActivity(client).catch(e => logger.error('[Scheduler] Initial Activity crash:', e));
                } else {
                    logger.info('Test bot detected. Background activity polling is DISABLED.', 'System');
                }

                setInterval(async () => {
                    try {
                        await checkAiringAnime(client);
                        if (!client.isTestBot) await checkUserActivity(client);
                    } catch (error) {
                        logger.error('Notification loop failure:', error, 'Scheduler');
                    }
                }, 5 * 60 * 1000); 

                // --- 2. Housekeeping & Cache Maintenance (1h) ---
                setInterval(() => {
                    flushAniListCache();
                    clearConfigCache();
                }, 60 * 60 * 1000);
            }, 10000);
        }
 else {
            logger.info('Internal Scheduler disabled. Assuming external cron via worker.js', 'System');
        }

    },
};
