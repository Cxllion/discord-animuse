const { Events } = require('discord.js');
const { checkAiringAnime, checkUserActivity, syncAllUserTrackers, checkWordleHousekeeping, checkConnect4Housekeeping } = require('../utils/services/scheduler');
const { deployCommands } = require('../utils/core/commandDeployer');
const logger = require('../utils/core/logger');
const CONFIG = require('../utils/config');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        // --- Sanctuary Status Board ---
        const modeLabel = client.isTestBot ? 'ARCHIVAL TEST' : 'GRAND LIBRARY (PROD)';
        const shardLabel = `${client.shardId + 1}/${client.shardCount}`;
        const cmdCount = client.commands?.size || 0;
        const guildCount = client.guilds.cache.size;

        console.log('\n┌──────────────────────────────────────────┐');
        console.log(`│   🏮  ANIMUSE SANCTUARY ONLINE  🏮      │`);
        console.log(`├──────────────────────────────────────────┤`);
        console.log(`│  Identity : ${client.user.tag.padEnd(28)} │`);
        console.log(`│  Mode     : ${modeLabel.padEnd(28)} │`);
        console.log(`│  Shard    : ${shardLabel.padEnd(28)} │`);
        console.log(`│  Library  : ${guildCount.toString().padEnd(2)} Guilds | ${cmdCount.toString().padEnd(2)} Volumes      │`);
        console.log(`│  Status   : Systems Operational ♡        │`);
        console.log('└──────────────────────────────────────────┘\n');
        
        // Initialize Interval Tracker
        client.intervals = client.intervals || [];

        // Clear Caches
        const { flushAniListCache } = require('../utils/services/anilistService');
        const { clearConfigCache } = require('../utils/services/guildConfigService');
        flushAniListCache();
        clearConfigCache();

        // ── Dynamic Presence Rotation ─────────────────────────────────────────
        const activities = [
            { name: 'over the Library Archives... 📚', type: 3 },
            { name: 'the AniList Airing Ticker... 📡', type: 3 },
            { name: 'the rustle of digital pages... 📖', type: 2 },
            { name: 'Categorizing new memories... ✨', type: 0 },
            { name: 'vibrant HUD statistics... 📊', type: 3 },
            { name: 'for new Readers to arrive... ♡', type: 3 }
        ];

        let activityIndex = 0;
        const updatePresence = () => {
            if (!client.user || client.destroyed) return;
            const act = activities[activityIndex];
            try {
                client.user.setPresence({
                    activities: [{ name: act.name, type: act.type }],
                    status: 'online'
                });
                activityIndex = (activityIndex + 1) % activities.length;
            } catch (e) {}
        };

        updatePresence();
        client.intervals.push(setInterval(updatePresence, 60 * 1000));

        // Deploy Commands
        if (CONFIG.DEPLOY_ON_START) {
            try {
                await deployCommands(client);
            } catch (e) {
                logger.error('Command deployment failure:', e, 'Deployer');
            }
        }

        client.isSystemsGo = true;

        try {
            await require('../utils/mafia/MafiaManager').loadState(client);
        } catch (e) {
            logger.error('Failed to load mafia state:', e);
        }

        // ── Start Component Task Schedulers ─────────────────────────────────────────

        // ── Dedup Table Probe (Render-safe check) ───────────────────────────
        try {
            const supabase = require('../utils/core/supabaseClient');
            
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
                logger.debug('✅ [Activity Dedup] Supabase `activity_posted` table FOUND — persistent dedup is ACTIVE. Render-safe! ♡', 'System');
            } else {
                logger.warn('⚠️ [Activity Dedup] Supabase `activity_posted` table NOT FOUND — falling back to local file cache. Run the migration script to activate persistent dedup.', 'System');
            }
        } catch (e) {
            logger.warn('⚠️ [Activity Dedup] Could not reach Supabase for migration probe (Internal Error).', 'System');
        }

        if (!CONFIG.DISABLE_INTERNAL_SCHEDULER) {
            setTimeout(async () => {
                logger.debug('Initializing scheduler activities...', 'System');
                
                // 1. Airing Notifications (5m)
                client.scheduler.addTask('Airing Detection', checkAiringAnime, 5 * 60 * 1000, { immediate: true });
                
                // 2. User Activity Feeds (5m)
                client.scheduler.addTask('Activity Feed', checkUserActivity, 5 * 60 * 1000, { immediate: true });

                // 3. Sync User Trackers (6h)
                client.scheduler.addTask('Tracker Sync', syncAllUserTrackers, 6 * 60 * 60 * 1000);

                // 4. Global Housekeeping (1h)
                client.scheduler.addTask('Housekeeping', () => {
                    flushAniListCache();
                    clearConfigCache();
                }, 3600 * 1000, { testModeSafe: true });

                // 5. Wordle Cycle Monitor (15m)
                const { checkWordleReset } = require('../utils/services/scheduler');
                client.scheduler.addTask('Wordle Cycle Monitor', checkWordleReset, 15 * 60 * 1000, { immediate: true });

                // 6. Wordle Housekeeping (15m)
                client.scheduler.addTask('Wordle Housekeeping', checkWordleHousekeeping, 15 * 60 * 1000, { immediate: true });

                // 7. Connect4 Housekeeping (5m)
                client.scheduler.addTask('Connect4 Housekeeping', checkConnect4Housekeeping, 5 * 60 * 1000, { immediate: true });

            }, 10000);
        } else {
            logger.info('Internal Scheduler disabled. Assuming external worker.', 'System');
        }
    },
};
