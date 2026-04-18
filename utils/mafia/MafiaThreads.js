const logger = require('../core/logger');

/**
 * MafiaThreads: Manages thread creation, privacy, and locking.
 */
class MafiaThreads {
    /**
     * Initializes the game threads.
     * @param {Object} game 
     */
    static async setup(game) {
        if (!game.thread) return;

        try {
            // 1. Setup Graveyard (Spectators)
            const grave = await game.thread.parent.threads.create({
                name: `🕯️-archives-${game.hostId.slice(-4)}`,
                autoArchiveDuration: 60,
                reason: 'Mafia Spectator Archives',
                hideFromInvites: true
            });
            game.graveyardThreadId = grave.id;
            
            // 2. Setup Archive (Mafia Chat - if needed by mode)
            if (game.settings.gameMode !== 'Open Archives') {
                const secret = await game.thread.parent.threads.create({
                    name: `🤫-infection-${game.hostId.slice(-4)}`,
                    autoArchiveDuration: 60,
                    type: 11, // Private thread (needs Boost level usually, or we use standard and just dont invite?)
                    // Note: discord.js handles some things differently for private threads.
                });
                game.archiveThreadId = secret.id;
            }
        } catch (e) {
            logger.error('[Mafia] Thread setup failed:', e, 'Mafia');
        }
    }

    /**
     * Locks/Unlocks a thread.
     */
    static async setLock(thread, locked, reason = '') {
        if (!thread) return;
        try {
            await thread.setLocked(locked, reason);
        } catch (e) {
            logger.error(`[Mafia] Failed to ${locked ? 'lock' : 'unlock'} thread ${thread.id}:`, e, 'Mafia');
        }
    }

    /**
     * Moves a player to the spectator archives.
     */
    static async addSpectator(game, userId) {
        if (!game.graveyardThreadId || !game.thread) return;
        try {
            const grave = await game.thread.parent.threads.fetch(game.graveyardThreadId).catch(() => null);
            if (grave) {
                await grave.members.add(userId).catch(() => null);
                // Notification handled by orchestrator/moveToGraveyard
            }
        } catch (e) {}
    }
}

module.exports = MafiaThreads;
