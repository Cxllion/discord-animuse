const logger = require('./logger');

/**
 * High-Precision Token Bucket Rate Limiter
 * Ensures we don't exceed API rate limits while maximizing throughput.
 */
class RateLimiter {
    /**
     * @param {number} tokensPerMinute - Number of requests allowed per minute
     * @param {number} maxBurst - Maximum tokens that can be accumulated
     */
    constructor(tokensPerMinute, maxBurst = 10) {
        this.tokensPerMinute = tokensPerMinute;
        this.maxBurst = maxBurst;
        this.tokens = maxBurst;
        this.lastRefill = Date.now();
        this.queue = [];
        this.refillInterval = (60 * 1000) / tokensPerMinute;
        
        this.processQueue();
    }

    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const newTokens = elapsed / this.refillInterval;
        
        this.tokens = Math.min(this.maxBurst, this.tokens + newTokens);
        this.lastRefill = now;
    }

    /**
     * Request a token
     * @returns {Promise<void>}
     */
    async acquire() {
        return new Promise((resolve) => {
            this.queue.push(resolve);
        });
    }

    /**
     * Internal processor for the request queue
     */
    async processQueue() {
        while (true) {
            this.refill();

            if (this.tokens >= 1 && this.queue.length > 0) {
                const resolve = this.queue.shift();
                this.tokens -= 1;
                resolve();
            }

            // Sleep for a short duration or until next token refill
            const sleepTime = this.tokens < 1 ? this.refillInterval : 50;
            await new Promise(r => setTimeout(r, sleepTime));
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            tokens: Math.floor(this.tokens),
            queueLength: this.queue.length,
            limit: this.tokensPerMinute
        };
    }
}

module.exports = RateLimiter;
