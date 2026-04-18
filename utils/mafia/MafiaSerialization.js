const Player = require('./MafiaPlayer');

/**
 * MafiaSerialization: Handles data persistence formats.
 */
class MafiaSerialization {
    /**
     * Converts game instance to a serializable object.
     */
    static serialize(game) {
        return {
            lobbyMessageId: game.lobbyMessageId,
            hostId: game.hostId,
            guildId: game.guildId,
            channelId: game.channelId,
            threadId: game.threadId,
            state: game.state,
            dayCount: game.dayCount,
            settings: game.settings,
            graveyardThreadId: game.graveyardThreadId,
            archiveThreadId: game.archiveThreadId,
            activePhaseMessageId: game.activePhaseMessageId,
            hubMessageId: game.hubMessageId,
            lastActivityAt: game.lastActivityAt,
            stagnationNoticeSent: game.stagnationNoticeSent,
            phaseEndTime: game.phaseEndTime,
            voiceChannelId: game.voiceChannelId,
            isSecure: game.isSecure,
            players: Array.from(game.players.entries()).map(([id, p]) => ({ id, ...p.toJSON() })),
            visitHistory: game.visitHistory || [],
            guiltDeaths: (game.guiltDeaths || []).map(p => p.id)
        };
    }

    /**
     * Hydrates a game instance from a plain object.
     */
    static deserialize(game, data) {
        game.lobbyMessageId = data.lobbyMessageId;
        game.hostId = data.hostId;
        game.guildId = data.guildId;
        game.channelId = data.channelId;
        game.threadId = data.threadId;
        game.state = data.state;
        game.dayCount = data.dayCount;
        game.settings = data.settings || game.settings;
        game.graveyardThreadId = data.graveyardThreadId;
        game.archiveThreadId = data.archiveThreadId;
        game.hubMessageId = data.hubMessageId || data.activePhaseMessageId;
        game.activePhaseMessageId = data.activePhaseMessageId || data.hubMessageId;
        game.lastActivityAt = data.lastActivityAt || Date.now();
        game.stagnationNoticeSent = data.stagnationNoticeSent || false;
        game.phaseEndTime = data.phaseEndTime || null;
        game.voiceChannelId = data.voiceChannelId || null;
        game.isSecure = data.isSecure !== undefined ? data.isSecure : true;

        if (data.players) {
            game.players.clear();
            for (const pData of data.players) {
                const player = new Player({ id: pData.id, displayName: pData.name }, pData.isBot);
                player.fromJSON(pData);
                game.players.set(pData.id, player);
            }
        }

        game.visitHistory = data.visitHistory || [];
        if (data.guiltDeaths && Array.isArray(data.guiltDeaths)) {
            game.guiltDeaths = data.guiltDeaths.map(id => game.players.get(id)).filter(Boolean);
        }
    }
}

module.exports = MafiaSerialization;
