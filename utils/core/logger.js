const { EmbedBuilder, WebhookClient } = require('discord.js');

/**
 * Standardized Logger for AniMuse
 * Levels: INFO, WARN, ERROR, DEBUG
 */

const formatTime = () => new Date().toISOString().replace('T', ' ').split('.')[0];

const info = (message, context = '') => {
    console.log(`[${formatTime()}] [INFO] ${context ? `[${context}] ` : ''}${message}`);
};

const warn = (message, context = '') => {
    console.warn(`[${formatTime()}] [WARN] ${context ? `[${context}] ` : ''}${message}`);
};

const error = (message, err = null, context = '') => {
    console.error(`[${formatTime()}] [ERROR] ${context ? `[${context}] ` : ''}${message}`);
    if (err) {
        if (err.stack) console.error(err.stack);
        else console.error(err);
    }
};

const debug = (message, context = '') => {
    if (process.env.DEBUG === 'true') {
        console.log(`[${formatTime()}] [DEBUG] ${context ? `[${context}] ` : ''}${message}`);
    }
};

module.exports = { info, warn, error, debug };
