const { EmbedBuilder, WebhookClient } = require('discord.js');

/**
 * Standardized Logger for AniMuse
 * Levels: INFO, WARN, ERROR, DEBUG
 */

// Initialize Global Developer Webhook
let globalWebhook = null;
if (process.env.LOGS_WEBHOOK_URL) {
    try {
        globalWebhook = new WebhookClient({ url: process.env.LOGS_WEBHOOK_URL });
    } catch (e) {
        console.error('[Logger] Failed to initialize Global Webhook:', e.message);
    }
}

const formatTime = () => new Date().toISOString().replace('T', ' ').split('.')[0];

const info = (message, context = '') => {
    console.log(`[${formatTime()}] [INFO] ${context ? `[${context}] ` : ''}${message}`);
};

const warn = (message, context = '') => {
    console.warn(`[${formatTime()}] [WARN] ${context ? `[${context}] ` : ''}${message}`);
};

const error = (message, err = null, context = '') => {
    const logPrefix = `[${formatTime()}] [ERROR] ${context ? `[${context}] ` : ''}`;
    console.error(`${logPrefix}${message}`);
    
    if (err) {
        if (err.stack) console.error(err.stack);
        else console.error(err);
    }

    // Report to Global Webhook (Developer Alert)
    if (globalWebhook) {
        const baseEmbed = require('../generators/baseEmbed');
        const embed = baseEmbed('🚨 Critical System Alert', 
            `**${message}**\n\n\`\`\`js\n${err?.message || 'No additional error info'}\n\`\`\``, 
            null
        )
            .addFields(
                { name: 'Context', value: context || 'None', inline: true },
                { name: 'Timestamp', value: formatTime(), inline: true }
            )
            .setColor(0xFF0000); // Red

        globalWebhook.send({ embeds: [embed] }).catch(() => {});
    }
};

/**
 * Log a server-specific report directly to a Discord channel.
 * @param {Guild} guild - Discord Guild object
 * @param {string} channelId - The logs_channel_id from config
 * @param {EmbedBuilder} embed - The report embed
 */
const reportToGuild = async (guild, channelId, embed) => {
    if (!channelId) return;
    try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        // Silently fail to avoid recursion if logging itself errors
    }
};

const debug = (message, context = '') => {
    if (process.env.DEBUG === 'true') {
        console.log(`[${formatTime()}] [DEBUG] ${context ? `[${context}] ` : ''}${message}`);
    }
};

module.exports = { info, warn, error, debug, reportToGuild };
