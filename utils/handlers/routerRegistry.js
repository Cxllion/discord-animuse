const logger = require('../core/logger');

/**
 * @typedef {Object} RouterConfig
 * @property {string[]} [prefixes] - List of customId prefixes to match.
 * @property {string[]} [ids] - List of exact customIds to match.
 * @property {boolean} [handleModals] - Whether this handler handles modal submits too.
 * @property {Function} handle - The function that handles the interaction.
 */

class RouterRegistry {
    constructor() {
        this.handlers = [];
        this.prefixMap = new Map();
        this.idMap = new Map();
    }

    /**
     * Registers a new interaction handler.
     * @param {RouterConfig} config 
     */
    register(config) {
        if (!config.handle) {
            throw new Error(`Handler registration failed: missing 'handle' function.`);
        }

        const entry = {
            handle: config.handle,
            prefixes: config.prefixes || [],
            ids: config.ids || [],
            handleModals: config.handleModals || false
        };

        this.handlers.push(entry);

        // Populate faster lookup maps
        entry.prefixes.forEach(p => this.prefixMap.set(p, entry));
        entry.ids.forEach(id => this.idMap.set(id, entry));

        logger.debug(`Registered handler matching [${entry.prefixes.join(', ')}] [${entry.ids.join(', ')}]`, 'Router');
    }

    /**
     * Finds a matching handler for a customId.
     * @param {string} customId 
     * @returns {Object|null}
     */
    findHandler(customId) {
        // 1. Direct ID match (O(1))
        if (this.idMap.has(customId)) return this.idMap.get(customId);

        // 2. Prefix match (O(N_prefixes))
        // We can optimize this further if needed, but the number of prefixes is small.
        for (const [prefix, handler] of this.prefixMap.entries()) {
            if (customId.startsWith(prefix)) return handler;
        }

        return null;
    }

    clear() {
        this.handlers = [];
        this.prefixMap.clear();
        this.idMap.clear();
    }
}

module.exports = new RouterRegistry();
