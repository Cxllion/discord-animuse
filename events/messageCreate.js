const { Events } = require('discord.js');
const { fetchConfig, pulseChannelActivity } = require('../utils/core/database');
const baseEmbed = require('../utils/generators/baseEmbed');
const activityPulseCache = require('../utils/core/activityPulseCache');
const logger = require('../utils/core/logger');
const { getDynamicUserTitle } = require('../utils/core/userMeta');
const CONFIG = require('../utils/config');
// Hoisted module references (Node.js caches these; hoisting avoids resolution overhead in hot path)
const MafiaManager = require('../utils/mafia/MafiaManager');
const { markAsSpoken } = require('../utils/services/welcomeService');
const { addXp } = require('../utils/services/leveling');
const { getLinkedAnilist } = require('../utils/services/userService');
const { pulseUserActivity } = require('../utils/services/scheduler');

// ─── Gallery Constants ───────────────────────────────────────────────────────
// Issue 15: Named constant so archive duration is easy to locate and make configurable
const GALLERY_THREAD_ARCHIVE_DURATION = 1440; // 24 hours (Discord: 60, 1440, 4320, 10080)

// Issue 19: Expanded to cover common anime/media sharing sites beyond just Tenor/Giphy
const GALLERY_MEDIA_REGEX = /(https?:\/\/[^\s]+)\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)(\?[^\s]*)?/i;
const DISCORD_CDN_REGEX = /cdn\.discordapp\.com|media\.discordapp\.net/i;
const GIF_SITE_REGEX = /tenor\.com|giphy\.com|imgur\.com|i\.redd\.it|gfycat\.com|catbox\.moe|pbs\.twimg\.com|i\.pximg\.net/i;
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const botType = CONFIG.BOT_TYPE || 'main';
        // Issue 1 & 2: Single declaration at the top, brace structure fixed
        const isSelfTest = message.client.isTestBot;

        // --- Mafia Vigilant Redaction (Silence for the Dead) ---
        if ((botType === 'main' || botType === 'test') && message.channel.isThread()) {
            const game = MafiaManager.games.get(message.channel.id);
            if (game && game.state !== 'LOBBY' && game.state !== 'GAME_OVER') {
                const player = game.players.get(message.author.id);
                if (player && !player.alive) {
                    try {
                        await message.delete();
                        return; // Halt further processing for redacted messages
                    } catch (e) {}
                }
            }
        }

        // --- 1. Background Logic (Parallelized) ---
        const backgroundTasks = [
            fetchConfig(message.guild.id),
            markAsSpoken(message.author.id, message.guild.id).catch(() => {}),
            pulseChannelActivity(message.guild.id, message.channel.id).catch(() => {})
        ];

        const [config] = await Promise.all(backgroundTasks);
        if (!config) return;

        // --- Maintenance Mode Guard ---
        if (config.maintenance_mode && !isSelfTest) return;

        // --- Archive Bureau (Pin Mirroring) ---
        if ((botType === 'core' || botType === 'test') && !isSelfTest && message.type === 6 && config.archive_mirror_channel_id) {
            const archiveChannel = message.guild.channels.cache.get(config.archive_mirror_channel_id);
            if (archiveChannel) {
                try {
                    // Fetch the message that was just pinned
                    const pinnedMessages = await message.channel.messages.fetchPinned();
                    const latestPin = pinnedMessages.first();

                    if (latestPin) {
                        const archiveEmbed = baseEmbed(null, latestPin.content || '*No content*', null)
                            .setAuthor({ name: latestPin.author.username, iconURL: latestPin.author.displayAvatarURL() })
                            .addFields(
                                { name: 'Source Wing', value: `<#${message.channel.id}>`, inline: true },
                                { name: 'Jump to Record', value: `[Go to Message](${latestPin.url})`, inline: true }
                            )
                            .setColor(CONFIG.COLORS.ARCHIVE);

                        if (latestPin.attachments.size > 0) {
                            archiveEmbed.setImage(latestPin.attachments.first().url);
                        }

                        await archiveChannel.send({
                            content: `📌 **New Archive Entry** from <#${message.channel.id}>`,
                            embeds: [archiveEmbed]
                        });
                    }
                } catch (err) {
                    logger.error('[ArchiveBureau] Failed to mirror pin:', err, 'MessageEvent');
                }
            }
        }

        // --- Gallery Mode ---
        // Issue 7: Coerce IDs to strings to prevent type-mismatch false negatives
        const galleryIds = (config.gallery_channel_ids || []).map(String);
        if ((botType === 'core' || botType === 'test') && !isSelfTest && galleryIds.includes(String(message.channel.id))) {
            const hasMedia = message.attachments.size > 0 ||
                             GALLERY_MEDIA_REGEX.test(message.content) ||
                             DISCORD_CDN_REGEX.test(message.content) ||
                             GIF_SITE_REGEX.test(message.content);

            if (hasMedia) {
                // Valid post: Create thread
                try {
                    const displayName = message.member?.displayName || message.author.displayName || message.author.username;
                    // Issue 8: Truncate display name to avoid exceeding Discord's 100-char thread name limit
                    const safeName = displayName.slice(0, 90);
                    const threadName = `${safeName}'s Post`;

                    await message.startThread({
                        name: threadName,
                        autoArchiveDuration: GALLERY_THREAD_ARCHIVE_DURATION,
                    });

                    // Auto-reaction: Just one heart ❤️
                    await message.react('❤️').catch(() => {});

                } catch (error) {
                    if (error.code === 160004) return; // Thread already exists, ignore.
                    logger.error(`[Gallery Error] Could not create thread in ${message.channel.id}:`, error, 'MessageEvent');
                }
            } else {
                // Invalid post: Delete and warn
                try {
                    if (message.deletable) {
                        // Issue 16: Fetch title before delete so both actions are ready
                        const userTitle = await getDynamicUserTitle(message.member);
                        await message.delete();

                        // Issue 16: Warning embed has a proper title and footer branding
                        const embed = baseEmbed()
                            .setTitle('📵 Gallery Violation')
                            .setDescription(`I'm sorry, **${userTitle}**, but this wing of the gallery is for visual archives only. Please keep the library tidy for other **Readers**! ♡\n\n*(Use the threads for conversation!)*`)
                            .setColor(CONFIG.COLORS.GALLERY) // Issue 3: Now defined in config
                            .setFooter({ text: CONFIG.THEME.FOOTER });

                        const warning = await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });

                        // Issue 10: Safer cleanup — timeout tracked and errors caught
                        const cleanupTimeout = setTimeout(async () => {
                            try {
                                await warning.delete();
                            } catch (e) {
                                if (e.code !== 10008) { // Unknown Message — already gone
                                    logger.error('Warning delete failed', e, 'MessageEvent');
                                }
                            }
                        }, 5000);

                        // Prevent unhandled rejections if warning itself was already deleted
                        warning.once('delete', () => clearTimeout(cleanupTimeout));
                    }
                } catch (error) {
                    if (error.code === 10008) return;
                    logger.error(`[Gallery Error] Could not delete message in ${message.channel.id}:`, error, 'MessageEvent');
                }
            }
            return;
        }

        if (botType === 'main' || botType === 'test') {
            // --- Levelling & Rank Hook ---
            if (!isSelfTest) {
                await addXp(message.author.id, message.guild.id, message.member, message);
            }

            // --- AniList Activity Pulse (Instant Tracking) ---
            if (config.activity_channel_id && !isSelfTest) {
                const cooldownKey = `${message.author.id}_${message.guild.id}`;
                const lastPulse = activityPulseCache.get(cooldownKey) || 0;
                const now = Date.now();
                const cooldownMs = 2 * 60 * 1000;

                if (now - lastPulse > cooldownMs) {
                    const anilistUsername = await getLinkedAnilist(message.author.id, message.guild.id);
                    if (anilistUsername) {
                        logger.info(`[Activity Pulse] Triggering check for ${message.author.tag} (${anilistUsername})`, 'Scheduler');
                        const activityChannel = await message.guild.channels.fetch(config.activity_channel_id).catch(() => null);
                        if (activityChannel) {
                            const userRow = {
                                user_id: String(message.author.id),
                                anilist_username: anilistUsername
                            };
                            await pulseUserActivity(message.client, message.guild.id, userRow, activityChannel);
                            activityPulseCache.set(cooldownKey, now);
                        }
                    }
                }
            }

            // --- Archive Lobby Bumping ---
            const lobby = MafiaManager.lobbies.find(g => g.channelId === message.channel.id && g.state === 'LOBBY');
            if (lobby) {
                lobby.scheduleRefresh(message.channel);
            }
        }
    },
};

