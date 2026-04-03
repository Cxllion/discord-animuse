/**
 * Simple in-memory cache with TTL support.
 */
class SimpleCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Set a value in the cache with a TTL (in milliseconds).
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttl 
     */
    set(key, value, ttl = 60000) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });

        // Auto-cleanup
        setTimeout(() => {
            this.delete(key);
        }, ttl);
    }

    /**
     * Get a value from the cache if it hasn't expired.
     * @param {string} key 
     * @returns {any|null}
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Delete a value from the cache.
     * @param {string} key 
     */
    delete(key) {
        this.cache.delete(key);
    }
}

module.exports = new SimpleCache();
