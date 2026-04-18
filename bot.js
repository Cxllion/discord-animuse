const { ShardingManager } = require('discord.js');
const logger = require('./utils/core/logger');
require('dotenv').config();

// ==========================================
// ANIMUSE SHARDING MANAGER (Master Process)
// ==========================================

const token = process.env.DISCORD_TOKEN;
const enableSharding = process.env.ENABLE_SHARDING === 'true';

if (!enableSharding) {
    logger.info('[Sharding] Sharding is DISABLED. Launching monolithic instance via index.js...', 'Manager');
    require('./index.js');
} else {
    logger.info('[Sharding] Sharding is ENABLED. Preparing to spawn library workers... ♡', 'Manager');

    const manager = new ShardingManager('./index.js', {
        token: token,
        totalShards: 'auto', // Discord will determine best shard count
        respawn: true       // Automatically restart crashed shards
    });

    manager.on('shardCreate', shard => {
        logger.info(`[Sharding] Launched Shard #${shard.id}`, 'Manager');
        
        shard.on('disconnect', () => {
            logger.warn(`[Sharding] Shard #${shard.id} disconnected.`, 'Manager');
        });

        shard.on('reconnecting', () => {
            logger.info(`[Sharding] Shard #${shard.id} is reconnecting...`, 'Manager');
        });
    });

    manager.spawn().catch(err => {
        logger.error('[Sharding] Failed to spawn shards:', err, 'Manager');
        process.exit(1);
    });
}
