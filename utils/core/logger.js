const winston = require('winston');
require('winston-daily-rotate-file');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const CONFIG = require('../config');
const path = require('path');

/**
 * Modernized Logger for AniMuse V2
 * Built on Winston for structured logging, rotation, and scalability.
 */

// Custom Log Levels for Library Theme
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'blue',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Console Formatting (Readable)
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `[${info.timestamp}] [${info.level}] ${info.context ? `[${info.context}] ` : ''}${info.message}${info.stack ? `\n${info.stack}` : ''}`
    )
);

// File Formatting (Structured JSON)
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const transports = [
    // 1. Console Transport
    new winston.transports.Console({
        format: consoleFormat,
        level: CONFIG.DEBUG ? 'debug' : 'info',
    }),

    // 2. Daily Rotate File (Combined logs)
    new winston.transports.DailyRotateFile({
        filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        format: fileFormat,
        level: 'info',
    }),

    // 3. Daily Rotate File (Error only)
    new winston.transports.DailyRotateFile({
        filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        format: fileFormat,
        level: 'error',
    }),
];

const loggerInstance = winston.createLogger({
    level: CONFIG.DEBUG ? 'debug' : 'info',
    levels,
    transports,
});

// --- DISCORD WEBHOOK INTEGRATION ---
let globalWebhook = null;
if (CONFIG.LOGS_WEBHOOK_URL) {
    try {
        globalWebhook = new WebhookClient({ url: CONFIG.LOGS_WEBHOOK_URL });
    } catch (e) {
        console.error('[Logger] Failed to initialize Global Webhook:', e.message);
    }
}

/**
 * Wrap Winston methods for backward compatibility and enhanced features
 */
const log = {
    info: (message, context = '') => loggerInstance.info(message, { context }),
    warn: (message, context = '') => loggerInstance.warn(message, { context }),
    debug: (message, context = '') => loggerInstance.debug(message, { context }),
    
    error: (message, err = null, context = '') => {
        const metadata = { context };
        if (err instanceof Error) {
            metadata.stack = err.stack;
            metadata.errorMsg = err.message;
        } else if (err) {
            metadata.errorInfo = err;
        }

        loggerInstance.error(message, metadata);

        // Report to Global Webhook (Developer Alert)
        if (CONFIG.LOGS_WEBHOOK_URL && !CONFIG.TEST_MODE) {
            const webhook = new WebhookClient({ url: CONFIG.LOGS_WEBHOOK_URL });
            const embed = new EmbedBuilder()
                .setTitle(`🚨 [System Error] ERROR`)
                .setDescription(`**${message}**\n\`\`\`${err?.message?.substring(0, 500) || 'No detailed error message provided.'}\`\`\``)
                .setColor('#FF0000')
                .setTimestamp();

            webhook.send({ embeds: [embed] }).catch(() => {});
        }
    },

    /**
     * Log a server-specific report directly to a Discord channel.
     */
    reportToGuild: async (guild, channelId, embed) => {
        if (!channelId || !guild) return;
        try {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel && channel.isTextBased()) {
                await channel.send({ embeds: [embed] });
            }
        } catch (e) {
            loggerInstance.error('Failed to report to guild channel', { context: 'Logger', error: e.message });
        }
    }
};

module.exports = log;
