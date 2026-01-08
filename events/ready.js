const { Events } = require('discord.js');
const { checkAiringAnime } = require('../utils/services/scheduler');
const { deployCommands } = require('../utils/core/commandDeployer');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`Ready! Logged in as ${client.user.tag}`, 'System');
        logger.info(`Animuse is now online and serving in ${client.guilds.cache.size} guilds.`, 'System');

        // Deploy Commands (Conditional)
        const shouldDeploy = process.env.DEPLOY_ON_START === 'true';
        if (shouldDeploy) {
            try {
                logger.info('Syncing archives with the main hall...', 'Deployer');
                await deployCommands(client);
                logger.info('Archives synchronized.', 'Deployer');
            } catch (e) {
                logger.error('Command deployment failure:', e, 'Deployer');
            }
        } else {
            logger.info('Command deployment skipped (DEPLOY_ON_START=false)', 'Deployer');
        }

        client.isSystemsGo = true;

        // Run scheduler shortly after startup (30s)
        setTimeout(() => {
            logger.info('Starting initial airing check...', 'Scheduler');
            checkAiringAnime(client).catch(err => logger.error('Initial airing check failed:', err, 'Scheduler'));
        }, 30 * 1000);

        setInterval(async () => {
            try {
                await checkAiringAnime(client);
            } catch (error) {
                logger.error('Notification loop failure:', error, 'Scheduler');
            }
        }, 10 * 60 * 1000);
    },
};
