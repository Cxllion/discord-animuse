const { Events } = require('discord.js');
const { fetchConfig, pulseChannelActivity } = require('../utils/core/database');
const baseEmbed = require('../utils/generators/baseEmbed');
const logger = require('../utils/core/logger');
const { getDynamicUserTitle } = require('../utils/core/userMeta');
const CONFIG = require('../utils/config');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        // --- Mafia Vigilant Redaction (Silence for the Dead) ---
        if (message.channel.isThread()) {
            const MafiaManager = require('../utils/mafia/MafiaManager');
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

        // Skip other automated tasks for test bot
        // But the Activity Pulse is allowed for live-dev testing
        const isSelfTest = message.client.isTestBot;

        // Fetch config (Note: FetchConfig has its own 5m in-memory cache)
        const config = await fetchConfig(message.guild.id);
        
        // --- Activity Pulse (For Hybrid Sorting) ---
        // Implementation: pulseChannelActivity has a 5m per-channel cooldown
        await pulseChannelActivity(message.guild.id, message.channel.id);
        
        // --- Anti-Ghosting: Protect Welcome ---
        if (!message.author.bot) {
            const { markAsSpoken } = require('../utils/services/welcomeService');
            await markAsSpoken(message.author.id, message.guild.id);
        }

        if (!config) return; // DB error or fresh guild

        // --- Archive Bureau (Pin Mirroring) ---
        if (!isSelfTest && message.type === 6 && config.archive_mirror_channel_id) {
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
        if (!isSelfTest && config.gallery_channel_ids && config.gallery_channel_ids.includes(message.channel.id)) {
            const urlRegex = /https?:\/\/[^\s]+/;
            const hasLink = urlRegex.test(message.content);

            if (message.attachments.size > 0 || hasLink) {
                // Valid post: Create thread
                try {
                    const displayName = message.member?.displayName || message.author.displayName || message.author.username;
                    const threadName = `${displayName}'s Post`;

                    await message.startThread({
                        name: threadName,
                        autoArchiveDuration: 1440, // 24 hours
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
                        const userTitle = await getDynamicUserTitle(message.member);
                        await message.delete();
                        const embed = baseEmbed()
                            .setDescription(`I'm sorry, **${userTitle}**, but this wing of the gallery is for visual archives only. Please keep the library tidy for other **Readers**! ♡\n\n*(Use the threads for conversation!)*`)
                            .setColor(CONFIG.COLORS.GALLERY);

                        const warning = await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
                        setTimeout(() => {
                            warning.delete().catch(e => logger.error('Warning delete failed', e, 'MessageEvent'));
                        }, 5000);
                    }
                } catch (error) {
                    if (error.code === 10008) return;
                    logger.error(`[Gallery Error] Could not delete message in ${message.channel.id}:`, error, 'MessageEvent');
                }
            }
            return;
        }

        // --- Levelling & Rank Hook ---
        if (!isSelfTest) {
            const { addXp } = require('../utils/services/leveling');
            await addXp(message.author.id, message.guild.id, message.member, message);
        }

        // --- AniList Activity Pulse (Instant Tracking) ---
        if (config.activity_channel_id && !message.client.isTestBot) {
            const { getLinkedAnilist } = require('../utils/services/userService');
            const { checkAndBroadcastUserActivity } = require('../utils/services/scheduler');
            
            if (!message.client.activityPulseCache) message.client.activityPulseCache = new Map();
            
            const cooldownKey = `${message.author.id}_${message.guild.id}`;
            const lastPulse = message.client.activityPulseCache.get(cooldownKey) || 0;
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
                        const { pulseUserActivity } = require('../utils/services/scheduler');
                        await pulseUserActivity(message.client, message.guild.id, userRow, activityChannel);
                        message.client.activityPulseCache.set(cooldownKey, now);
                    }
                }
            }
        }

        // --- Archive Lobby Bumping ---
        const gameManager = require('../utils/mafia/MafiaManager');
        const lobby = gameManager.lobbies.find(g => g.channelId === message.channel.id && g.state === 'LOBBY');
        if (lobby) {
            lobby.scheduleBump(message.channel);
        }
    },
};
