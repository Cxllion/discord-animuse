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

        if (client.isTestBot) {
            logger.info('Test bot detected. Automated background tasks (internal scheduler) are disabled to avoid conflicts.', 'System');
        } else if (process.env.DISABLE_INTERNAL_SCHEDULER !== 'true') {
            // Run scheduler shortly after startup (5 mins)
            // This prevents conflicts with administrative tasks like /deploy which run at startup
            setTimeout(() => {
                logger.info('Starting initial airing check...', 'Scheduler');
                checkAiringAnime(client).catch(err => logger.error('Initial airing check failed:', err, 'Scheduler'));
            }, 300 * 1000);

            setInterval(async () => {
                try {
                    await checkAiringAnime(client);
                    await checkUserActivity(client);
                } catch (error) {
                    logger.error('Notification loop failure:', error, 'Scheduler');
                }
            }, 5 * 60 * 1000); // 5 minute polling cycle
        } else {
            logger.info('Internal Scheduler disabled. Assuming external cron via worker.js', 'System');
        }

    },
};
