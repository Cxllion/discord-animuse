const logger = require('./logger');

/**
 * Sharding Adapter Utility
 * Provides cross-shard communication helpers and sharding-aware abstractions.
 */
class ShardingAdapter {
    /**
     * Get the total guild count across all shards.
     * @param {Client} client 
     */
    static async getGlobalGuildCount(client) {
        if (!client.shard) return client.guilds.cache.size;
        
        try {
            const results = await client.shard.fetchClientValues('guilds.cache.size');
            return results.reduce((acc, count) => acc + count, 0);
        } catch (e) {
            logger.error('[Sharding] Global guild count fetch failed:', e, 'Adapter');
            return client.guilds.cache.size;
        }
    }

    /**
     * Executes a function on a specific shard if sharding is enabled, or locally if not.
     * @param {Client} client 
     * @param {number} shardId 
     * @param {string} script - Stringified function to eval
     */
    static async evalOnShard(client, shardId, script) {
        if (!client.shard) {
            // If not sharded, just eval locally or handle index 0
            return eval(script);
        }
        return client.shard.broadcastEval(script, { shard: shardId });
    }

    /**
     * Internal check to see if the current shard is the "Main" shard (ID 0).
     * Useful for running background tasks that should only run once globally.
     * @param {Client} client 
     */
    static isMasterShard(client) {
        if (!client.shard) return true;
        return client.shard.ids.includes(0);
    }
}

module.exports = ShardingAdapter;
