const generalView = require('./views/general');
const levelsView = require('./views/levels');
const dashboardView = require('./views/dashboard');
const genericView = require('./views/generic');
const { EMOJIS } = require('../../config/emojiConfig');

// Registry of all dashboard categories
// Keys matching Autocomplete options
const registry = {
    // Main
    'dashboard': { label: `${EMOJIS.DASHBOARD} Dashboard`, handler: dashboardView, emoji: EMOJIS.DASHBOARD },

    // Bot Config
    'general': { label: `${EMOJIS.GENERAL} General`, handler: generalView, emoji: EMOJIS.GENERAL },
    'levels': { label: `${EMOJIS.LEVELS} Levels`, handler: levelsView, emoji: EMOJIS.LEVELS },

    // Admin / Management
    'members': { label: `${EMOJIS.MEMBER_MANAGEMENT} Members`, handler: genericView, emoji: EMOJIS.MEMBER_MANAGEMENT },
    'roles': { label: `${EMOJIS.ROLES} Roles`, handler: genericView, emoji: EMOJIS.ROLES },
    'emojis': { label: `${EMOJIS.EMOJIS} Emojis`, handler: genericView, emoji: EMOJIS.EMOJIS },
    'bans': { label: `${EMOJIS.ADMIN} Bans`, handler: genericView, emoji: EMOJIS.ADMIN },
    'invites': { label: `${EMOJIS.INVITES} Invites`, handler: genericView, emoji: EMOJIS.INVITES },

    // Infrastructure
    'channels': { label: `${EMOJIS.CHANNELS} Channels`, handler: genericView, emoji: EMOJIS.CHANNELS },
    'security': { label: `${EMOJIS.SECURITY} Security`, handler: genericView, emoji: EMOJIS.SECURITY },
    'audit': { label: `${EMOJIS.AUDIT} Audit Logs`, handler: genericView, emoji: EMOJIS.AUDIT },
    'server': { label: `${EMOJIS.GUILD_INFO} Server Info`, handler: genericView, emoji: EMOJIS.GUILD_INFO },
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
