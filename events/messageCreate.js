const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const baseEmbed = require('../utils/generators/baseEmbed');
const logger = require('../utils/core/logger');
const { getDynamicUserTitle } = require('../utils/core/userMeta');

const getSourceTag = (url) => {
    if (!url) return '';
    const u = url.toLowerCase();
    if (u.includes('twitter.com') || u.includes('x.com')) return '[Twitter] ';
    if (u.includes('pixiv.net')) return '[Pixiv] ';
    if (u.includes('artstation.com')) return '[ArtStation] ';
    if (u.includes('instagram.com')) return '[Instagram] ';
    if (u.includes('deviantart.com')) return '[DeviantArt] ';
    if (u.includes('reddit.com')) return '[Reddit] ';
    if (u.includes('pinterest.com')) return '[Pinterest] ';
    return '';
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Skip other automated tasks for test bot
        // But the Activity Pulse is allowed for live-dev testing
        const isSelfTest = message.client.isTestBot;


        // Fetch config (Note: In production, caching this is recommended to avoid DB spam)
        const config = await fetchConfig(message.guild.id);
        
        // --- Activity Pulse (For Hybrid Sorting) ---
        const { pulseChannelActivity } = require('../utils/core/database');
        await pulseChannelActivity(message.guild.id, message.channel.id);

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
                        const { EmbedBuilder } = require('discord.js');
                        const archiveEmbed = new EmbedBuilder()
                            .setAuthor({ name: latestPin.author.tag, iconURL: latestPin.author.displayAvatarURL() })
                            .setDescription(latestPin.content || '*No content*')
                            .addFields(
                                { name: 'Source', value: `<#${message.channel.id}>`, inline: true },
                                { name: 'Jump', value: `[Go to Message](${latestPin.url})`, inline: true }
                            )
                            .setColor('#A78BFA')
                            .setTimestamp(latestPin.createdAt);

                        if (latestPin.attachments.size > 0) {
                            archiveEmbed.setImage(latestPin.attachments.first().url);
                        }

                        await archiveChannel.send({ 
                            content: `📌 **New Archive Entry** from <#${message.channel.id}>`, 
                            embeds: [archiveEmbed] 
                        });
                    }
                } catch (err) {
                    console.error('[ArchiveBureau] Failed to mirror pin:', err);
                }
            }
        }

        // --- Gallery Mode ---
        if (!isSelfTest && config.gallery_channel_ids && config.gallery_channel_ids.includes(message.channel.id)) {
            const urlRegex = /https?:\/\/[^\s]+/;
            const match = message.content.match(urlRegex);
            const hasLink = !!match;
            const link = match ? match[0] : '';

            if (message.attachments.size > 0 || hasLink) {
                // Valid post: Create thread
                try {
                    const sourceTag = getSourceTag(link);
                    const displayName = message.member?.displayName || message.author.displayName || message.author.username;
                    const userTitle = await getDynamicUserTitle(message.member);
                    
                    // Extract content snippet for the thread name
                    let contentSnippet = message.content.replace(urlRegex, '').trim();
                    if (contentSnippet.length > 30) contentSnippet = contentSnippet.substring(0, 27) + '...';
                    
                    const threadName = contentSnippet 
                        ? `${sourceTag}Discussion: "${contentSnippet}" (by ${displayName})`
                        : `${sourceTag}Discussion: ${displayName}’s Post`;

                    const thread = await message.startThread({
                        name: threadName,
                        autoArchiveDuration: 1440, // 24 hours
                    });

                    // Option 1: Auto-reactions
                    await Promise.all([
                        message.react('❤️').catch(() => {}),
                        message.react('🔥').catch(() => {}),
                        message.react('🌟').catch(() => {})
                    ]);

                    // Option 3: Welcome message
                    await thread.send(`Welcome, **${userTitle}**. These discussions are for our **Readers** to reflect upon this visual archive. Please share your thoughts! ♡`);

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
                            .setColor('#FFACD1');

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

        // --- Leveling Hook ---
        if (!isSelfTest && config.leveling_enabled !== false) {
            const { addXp } = require('../utils/services/leveling');
            await addXp(message.author.id, message.guild.id, message.member, message);
        }

        // --- AniList Activity Pulse (Instant Tracking) ---
        if (config.activity_channel_id) {
            const { getLinkedAnilist, updateLastActivityId } = require('../utils/services/userService');
            const { checkAndBroadcastUserActivity } = require('../utils/services/scheduler');
            
            // Local Cooldown Map (Resets on restart, which is fine for ephemeral intent)
            if (!message.client.activityPulseCache) message.client.activityPulseCache = new Map();
            
            const cooldownKey = `${message.author.id}_${message.guild.id}`;
            const lastPulse = message.client.activityPulseCache.get(cooldownKey) || 0;
            const now = Date.now();
            
            // Check every 2 minutes when talking in dev/test mode (10m in prod usually)
            const cooldownMs = isSelfTest ? 2 * 60 * 1000 : 10 * 60 * 1000;

            if (now - lastPulse > cooldownMs) {
                const anilistUsername = await getLinkedAnilist(message.author.id, message.guild.id);
                if (anilistUsername) {
                    logger.info(`[Activity Pulse] Triggering check for ${message.author.tag} (${anilistUsername})`, 'Scheduler');
                    const activityChannel = message.guild.channels.cache.get(config.activity_channel_id);
                    if (activityChannel) {
                        const { data: userData } = await require('../utils/core/supabaseClient')
                            .from('users')
                            .select('last_activity_id')
                            .eq('user_id', message.author.id)
                            .eq('guild_id', message.guild.id)
                            .single();

                        const userRow = {
                            user_id: message.author.id,
                            anilist_username: anilistUsername,
                            last_activity_id: userData?.last_activity_id || 0
                        };

                        await checkAndBroadcastUserActivity(message.client, message.guild.id, userRow, activityChannel);
                        message.client.activityPulseCache.set(cooldownKey, now);
                    }
                }
            }
        }
    },
};
