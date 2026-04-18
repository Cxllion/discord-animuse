const logger = require('../core/logger');

/**
 * MafiaVoice: Handles all voice channel management and member states.
 */
class MafiaVoice {
    /**
     * Updates voice states (mute/unmute) based on game state.
     * @param {Object} game - MafiaGame instance
     * @param {string} phase - Current phase
     * @param {string|null} speakerId - Optional ID of single speaker (Twilight)
     */
    static async updateStates(game, phase = 'GAME', speakerId = null) {
        if (!game.voiceChannelId) return;

        try {
            const guild = await game.thread?.guild.fetch();
            if (!guild) return;

            const voiceChannel = await guild.channels.fetch(game.voiceChannelId).catch(() => null);
            if (!voiceChannel) return;

            // Gather all players who are currently in this voice channel
            const membersInVc = voiceChannel.members.filter(m => game.players.has(m.id));
            
            for (const [id, member] of membersInVc) {
                const player = game.players.get(id);
                if (!player) continue;

                let shouldMute = false;

                // Dead players are always muted in the game VC
                if (!player.alive) {
                    shouldMute = true;
                } else {
                    // Phase-based muting logic
                    if (phase === 'NIGHT') {
                        shouldMute = true;
                    } else if (phase === 'TWILIGHT') {
                        // In Twilight, only the person being executed (speakerId) can talk
                        shouldMute = (id !== speakerId);
                    } else {
                        // Day/Voting/Discussion: everyone alive talks
                        shouldMute = false;
                    }
                }

                // Apply mute/unmute if state differs
                if (member.voice.mute !== shouldMute) {
                    await member.voice.setMute(shouldMute, `Mafia Phase: ${phase}`).catch(() => null);
                }
            }
        } catch (e) {
            logger.error('[Mafia] Voice state synchronization failed:', e, 'Mafia');
        }
    }

    /**
     * Locks the voice channel (optional feature).
     */
    static async lockChannel(game) {
        if (!game.voiceChannelId) return;
        // Logic to lock/unlock permissions if needed
    }

    /**
     * Restores everyone's voice state (unmute all) when game ends.
     */
    static async restoreStates(game) {
        if (!game.voiceChannelId) return;
        try {
            const guild = await game.thread?.guild.fetch();
            if (!guild) return;
            const voiceChannel = await guild.channels.fetch(game.voiceChannelId).catch(() => null);
            if (voiceChannel) {
                for (const [id, member] of voiceChannel.members) {
                    if (member.voice.mute) {
                        await member.voice.setMute(false, 'Game Over').catch(() => null);
                    }
                }
            }
        } catch (e) {}
    }
}

module.exports = MafiaVoice;
