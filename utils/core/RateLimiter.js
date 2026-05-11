const logger = require('./logger');

/**
 * High-Precision Token Bucket Rate Limiter (Lazy Evaluation)
 * Refactored to avoid background polling loops.
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
        this.refillInterval = (60 * 1000) / tokensPerMinute;
        this.queue = [];
    }

    /**
     * Internal: Refill tokens based on elapsed time since last request.
     */
    _refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const newTokens = elapsed / this.refillInterval;
        
        if (newTokens >= 1) {
            this.tokens = Math.min(this.maxBurst, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }

    /**
     * Request a token
     * @returns {Promise<void>}
     */
    async acquire() {
        this._refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return Promise.resolve();
        }

        // Calculate time until next token is available
        const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                this.acquire().then(resolve);
            }, Math.max(waitTime, 50));
        });
    }

    /**
     * Get current status
     */
    getStatus() {
        this._refill();
        return {
            tokens: Math.floor(this.tokens),
            queueLength: this.queue.length,
            limit: this.tokensPerMinute
        };
    }
}

module.exports = RateLimiter;
