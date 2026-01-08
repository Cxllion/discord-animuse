const generalView = require('./views/general');
const levelsView = require('./views/levels');
const mediaView = require('./views/media'); // Keep for direct access if needed, or deprecate
const dashboardView = require('./views/dashboard');

// Registry of all dashboard categories
// Keys matching Autocomplete options
const registry = {
    // Main
    'dashboard': { label: '🏠 Dashboard', handler: dashboardView, emoji: '🏠' },

    // Bot Config
    'general': { label: '📖 General', handler: generalView, emoji: '📖' },
    'levels': { label: '📈 Levels', handler: levelsView, emoji: '📈' },

    // Legacy / Specific
    // 'media': { label: '📸 Media', handler: mediaView, emoji: '📸' }, // Hidden in favor of Channels

    // Admin / Management (Placeholders for Future)
    // 'roles': { label: '🎭 Roles', emoji: '🎭' }, // Moved to Parent Engine
    'emojis': { label: '😀 Emojis', emoji: '😀' },
    'bans': { label: '🔨 Bans', emoji: '🔨' },
    'invites': { label: '📨 Invites', emoji: '📨' },

    // System
    'audit': { label: '🛡️ Audit Logs', emoji: '🛡️' },
    'server': { label: 'ℹ️ Server Info', emoji: 'ℹ️' },
};

/**
 * Gets a handler for a specific category key.
 * @param {string} key 
 * @returns {object|null} The registry entry or null
 */
const getCategory = (key) => {
    return registry[key] || null;
};

/**
 * Returns all categories for autocomplete/dashboard.
 * @returns {object} Full registry
 */
const getAllCategories = () => {
    return registry;
};

module.exports = { getCategory, getAllCategories };
