const { Collection } = require('discord.js');
const { serviceClient: supabase } = require('./supabaseClient');
const logger = require('./logger');

/**
 * Cooldown Manager for AniMuse
 * Refactored for shard-safe database persistence.
 */
class CooldownManager {
    constructor() {
        this.cooldowns = new Collection();
        this.dbSyncEnabled = !!supabase;
    }

    /**
     * Check if user can use command (Memory + DB Fallback)
     * @returns {Promise<boolean>}
     */
    async check(userId, commandName, cooldownSeconds = 3, isOwner = false) {
        if (isOwner) return true;
        if (cooldownSeconds === 0) return true;

        const key = `${userId}-${commandName}`;
        const now = Date.now();

        // 1. Check Memory
        const memoryEntry = this.cooldowns.get(key);
        if (memoryEntry && now < memoryEntry.expiry) return false;

        // 2. Check DB (Cross-shard sync)
        if (this.dbSyncEnabled) {
            try {
                const { data } = await supabase
                    .from('cooldowns')
                    .select('expires_at')
                    .eq('id', key)
                    .single();

                if (data) {
                    const dbExpiry = new Date(data.expires_at).getTime();
                    if (dbExpiry > now) {
                        // Sync back to memory
                        this.set(userId, commandName, (dbExpiry - now) / 1000, true);
                        return false;
                    }
                }
            } catch (e) {
                // Ignore PagerDuty errors (row not found)
                if (e.code !== 'PGRST116') logger.error(`Cooldown DB Check Error: ${e.message}`, 'CooldownManager');
            }
        }

        return true;
    }

    /**
     * Set cooldown (Memory + DB)
     */
    async set(userId, commandName, cooldownSeconds = 3, skipDB = false) {
        if (cooldownSeconds <= 0) return;

        const key = `${userId}-${commandName}`;
        const expiry = Date.now() + (cooldownSeconds * 1000);

        // 1. Set Memory
        const timer = setTimeout(() => this.cooldowns.delete(key), cooldownSeconds * 1000);
        const existing = this.cooldowns.get(key);
        if (existing?.timer) clearTimeout(existing.timer);
        this.cooldowns.set(key, { expiry, timer });

        // 2. Set DB
        if (this.dbSyncEnabled && !skipDB) {
            try {
                await supabase.from('cooldowns').upsert({
                    id: key,
                    expires_at: new Date(expiry).toISOString()
                });
            } catch (e) {
                logger.error(`Cooldown DB Sync Failed: ${e.message}`, 'CooldownManager');
            }
        }
    }

    getRemainingTime(userId, commandName) {
        const key = `${userId}-${commandName}`;
        const entry = this.cooldowns.get(key);
        if (!entry) return 0;
        return Math.ceil((entry.expiry - Date.now()) / 1000);
    }
}

module.exports = new CooldownManager();
