const { Collection } = require('discord.js');
const logger = require('./logger');

/**
 * Cooldown Manager for AniMuse
 * Prevents command spam with library-themed rate limiting
 */
class CooldownManager {
    constructor() {
        this.cooldowns = new Collection();
        this.ownerBypass = true; // Owners bypass cooldowns
    }

    /**
     * Check if user can use command (not on cooldown)
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {number} cooldownSeconds - Cooldown duration in seconds
     * @param {boolean} isOwner - Whether user is bot owner
     * @returns {boolean} - True if can proceed, false if on cooldown
     */
    check(userId, commandName, cooldownSeconds = 3, isOwner = false) {
        // Owners bypass cooldowns
        if (isOwner && this.ownerBypass) return true;

        // No cooldown set
        if (cooldownSeconds === 0) return true;

        const key = `${userId}-${commandName}`;

        if (!this.cooldowns.has(key)) {
            return true;
        }

        const entry = this.cooldowns.get(key);
        const now = Date.now();

        if (now >= entry.expiry) {
            // Cooldown expired, allow
            clearTimeout(entry.timer);
            this.cooldowns.delete(key);
            return true;
        }

        // Still on cooldown
        return false;
    }

    /**
     * Set cooldown for user on command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {number} cooldownSeconds - Cooldown duration in seconds
     */
    set(userId, commandName, cooldownSeconds = 3) {
        if (cooldownSeconds === 0) return;

        const key = `${userId}-${commandName}`;
        const expiry = Date.now() + (cooldownSeconds * 1000);

        // Cancel any existing timer for this key before overwriting
        const existing = this.cooldowns.get(key);
        if (existing?.timer) clearTimeout(existing.timer);

        const timer = setTimeout(() => {
            this.cooldowns.delete(key);
        }, cooldownSeconds * 1000);

        this.cooldowns.set(key, { expiry, timer });
    }

    /**
     * Get remaining cooldown time in seconds
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {number} - Seconds remaining (0 if not on cooldown)
     */
    getRemainingTime(userId, commandName) {
        const key = `${userId}-${commandName}`;

        if (!this.cooldowns.has(key)) {
            return 0;
        }

        const entry = this.cooldowns.get(key);
        const now = Date.now();
        const remaining = Math.ceil((entry.expiry - now) / 1000);

        return remaining > 0 ? remaining : 0;
    }

    /**
     * Clear all cooldowns for a user (admin function)
     * @param {string} userId - Discord user ID
     */
    clearUser(userId) {
        const keys = Array.from(this.cooldowns.keys()).filter(k => k.startsWith(userId));
        keys.forEach(key => {
            const entry = this.cooldowns.get(key);
            if (entry?.timer) clearTimeout(entry.timer);
            this.cooldowns.delete(key);
        });
        logger.info(`Cleared all cooldowns for user ${userId}`, 'CooldownManager');
    }

    /**
     * Clear specific command cooldown for user
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     */
    clear(userId, commandName) {
        const key = `${userId}-${commandName}`;
        const entry = this.cooldowns.get(key);
        if (entry?.timer) clearTimeout(entry.timer);
        this.cooldowns.delete(key);
    }

    /**
     * Get total active cooldowns
     * @returns {number} - Number of active cooldowns
     */
    getActiveCount() {
        return this.cooldowns.size;
    }
}

// Create singleton instance
const cooldownManager = new CooldownManager();

module.exports = cooldownManager;
