const NodeCache = require('node-cache');
const logger = require('./logger');

/**
 * Unified Cache Manager for AniMuse V2
 * Provides namespaced caching with standardized TTLs and observability.
 */
class CacheManager {
    constructor() {
        this.caches = new Map();
        this.defaultTTL = 3600; // 1 Hour default
    }

    /**
     * Get or create a cache namespace
     * @param {string} namespace - Unique name for the cache (e.g. 'anilist', 'guild_config')
     * @param {Object} options - Node-Cache options
     * @returns {NodeCache}
     */
    getNamespace(namespace, options = {}) {
        if (!this.caches.has(namespace)) {
            const cache = new NodeCache({
                stdTTL: options.stdTTL || this.defaultTTL,
                checkperiod: options.checkperiod || 120,
                ...options
            });
            
            this.caches.set(namespace, cache);
            logger.debug(`[Cache] Initialized namespace: ${namespace}`, 'CacheManager');
        }
        return this.caches.get(namespace);
    }

    /**
     * Standardized getter
     */
    get(namespace, key) {
        const cache = this.caches.get(namespace);
        return cache ? cache.get(key) : undefined;
    }

    /**
     * Standardized setter
     */
    set(namespace, key, value, ttl) {
        const cache = this.caches.get(namespace);
        if (cache) {
            return ttl ? cache.set(key, value, ttl) : cache.set(key, value);
        }
        return false;
    }

    /**
     * Clear a specific namespace
     */
    flush(namespace) {
        const cache = this.caches.get(namespace);
        if (cache) {
            cache.flushAll();
            logger.info(`[Cache] Flushed namespace: ${namespace}`, 'CacheManager');
            return true;
        }
        return false;
    }

    /**
     * Get statistics for all caches
     */
    getStats() {
        const stats = {};
        for (const [name, cache] of this.caches) {
            stats[name] = cache.getStats();
        }
        return stats;
    }
}

// Singleton Instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
