const { Collection } = require('discord.js');

/**
 * Mock Discord Interaction for AniMuse V2 Tests
 */
class MockInteraction {
    constructor(options = {}) {
        this.id = options.id || 'mock-interaction-id';
        this.user = options.user || { id: 'mock-user-id', username: 'MockUser', tag: 'MockUser#0000' };
        this.guild = options.guild || { id: 'mock-guild-id', name: 'Mock Guild', shardId: 0 };
        this.client = options.client || { 
            commands: new Collection(),
            ws: { ping: 42 },
            scheduler: { getTelemetry: () => [] }
        };
        this.replied = false;
        this.deferred = false;
        this.replies = [];
        this.commandName = options.commandName || 'test';
        this.customId = options.customId || 'test-custom-id';
    }

    async reply(payload) {
        if (this.replied || this.deferred) throw new Error('Already replied or deferred');
        this.replied = true;
        this.replies.push(payload);
        return payload;
    }

    async deferReply(options = {}) {
        if (this.deferred || this.replied) throw new Error('Already replied or deferred');
        this.deferred = true;
        return options;
    }

    async editReply(payload) {
        this.replies.push(payload);
        return payload;
    }

    async followUp(payload) {
        this.replies.push(payload);
        return payload;
    }

    isChatInputCommand() { return !!this.commandName; }
    isAutocomplete() { return false; }
    isMessageComponent() { return !!this.customId; }
    isModalSubmit() { return false; }
    isRepliable() { return true; }
    inGuild() { return !!this.guild; }
}

module.exports = MockInteraction;
