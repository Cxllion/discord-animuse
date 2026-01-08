const { Colors } = require('discord.js');

const CONFIG = {
    // Brand Identity
    COLORS: {
        PRIMARY: '#FFACD1', // Soft Pink - Main Brand Color
        SECONDARY: '#B39DDB', // Soft Purple
        SUCCESS: '#81C784', // Pastel Green
        ERROR: '#E57373',   // Pastel Red
        WARNING: '#FFB74D', // Pastel Orange
        INFO: '#4FC3F7',    // Light Blue
        DARK: '#2C2F33',    // Dark Grey for backgrounds if needed
        INVISIBLE: '#2B2D31' // Discord Dark Mode Blend
    },

    // Standardized Emojis (Fallbacks included)
    EMOJIS: {
        SUCCESS: '✅',
        ERROR: '❌',
        WARNING: '⚠️',
        INFO: 'ℹ️',
        LOADING: '⏳',
        ARROW: '➜',
        DOT: '•'
    },

    // System Messages
    MESSAGES: {
        ERRORS: {
            GENERIC: "An unexpected error occurred in the archives.",
            PERMISSION: "You do not have the required permissions to perform this action.",
            BOT_PERMISSION: "I do not have the permissions to execute this. Please check my role hierarchy.",
            USER_NOT_FOUND: "I could not find that patron in this guild.",
            DB_ERROR: "The archives are currently inaccessible. Please try again later."
        },
        SUCCESS: {
            GENERIC: "Action completed successfully."
        }
    },

    // Feature Flags & Limits
    SETTINGS: {
        MAX_WARNINGS_BEFORE_ACTION: 3,
        DEFAULT_MUTE_DURATION: 60 * 60 * 1000, // 1 Hour
        XP_COOLDOWN: 60 * 1000 // 1 Minute
    }
};

module.exports = CONFIG;
