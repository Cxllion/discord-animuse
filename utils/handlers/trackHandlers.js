const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { getMediaById, getMediaByIds } = require('../services/anilistService');
const { getUserTrackedAnime, removeTracker, addTracker, getGuildTrackers } = require('../core/database');
const { handleInteractionError } = require('../core/errorHandler');
const baseEmbed = require('../generators/baseEmbed');
const logger = require('../core/logger');

/**
 * Renders the track list UI for a user
 * Shared between the initial command and global interaction callbacks
 */
const renderTrackList = async (guildId, userId, page = 0) => {
    const subs = await getUserTrackedAnime(guildId, userId);

    if (subs.length === 0) {
        return { 
            embeds: [baseEmbed('Archive Empty', '🍂 **Your Tracking Scroll is Empty**\n\nThe archives show no records under your name.', null)], 
            components: [] 
        };
    }

    const maxPerPage = 10;
    const totalPages = Math.ceil(subs.length / maxPerPage);
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const start = page * maxPerPage;
    const end = start + maxPerPage;
    const pageSubs = subs.slice(start, end);
    
    // Batch fetch media details for status emojis/formatting
    const mediaData = await getMediaByIds(pageSubs.map(s => s.anilist_id));

    const listText = pageSubs.map(s => {
        const media = mediaData.find(m => m.id === s.anilist_id);
        const statusEmoji = {
            'RELEASING': '📡',
            'NOT_YET_RELEASED': '🆕',
            'FINISHED': '✅',
            'HIATUS': '⏸️'
        }[media?.status] || '❓';
        const format = media?.format ? ` \`[${media.format}]\`` : '';
        return `• ${statusEmoji} **${s.anime_title}**${format}`;
    }).join('\n');

    const embed = baseEmbed('Tracing Archives: Observation List', 
        `Viewing your currently tracked collection. You will receive notifications for these series when new episodes arrive.\n\n${listText}`, 
        null
    ).setFooter({ text: `Page ${page + 1} of ${totalPages} • Total: ${subs.length} Series` });

    const optionsArr = pageSubs.map(s => ({
        label: s.anime_title.substring(0, 100),
        value: s.anilist_id.toString(),
        description: `ID: ${s.anilist_id}`,
        emoji: '🗑️'
    }));

    const rows = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`track_untrack_select_${userId}`)
                .setPlaceholder('Select a record to stop tracking...')
                .addOptions(optionsArr)
        )
    ];

    if (totalPages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`track_prev_page_${userId}_${page - 1}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`track_next_page_${userId}_${page + 1}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages - 1)
        ));
    }

    return { content: '', embeds: [embed], components: rows };
};

/**
 * Renders a global overview of all tracking in the guild (Moderator View)
 */
const renderGuildTrackView = async (guild, moderatorId, page = 0) => {
    const trackers = await getGuildTrackers(guild.id);

    if (trackers.length === 0) {
        return { 
            embeds: [baseEmbed('Archive Empty', '🍂 **The Global Tracking Scroll is Empty**\n\nNo records of inter-server observation were found.', null)], 
            components: [] 
        };
    }

    const maxPerPage = 25;
    const totalPages = Math.ceil(trackers.length / maxPerPage);
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const start = page * maxPerPage;
    const end = start + maxPerPage;
    const pageTrackers = trackers.slice(start, end);

    const listText = await Promise.all(pageTrackers.map(async (t) => {
        const member = await guild.members.fetch(t.user_id).catch(() => null);
        const name = member ? member.displayName : `User ${t.user_id}`;
        return `• **${name}**: ${t.count} shows`;
    }));

    const embed = baseEmbed('Global Observation Records', 
        `Viewing all active tracking archives across the server.\n\n${listText.join('\n')}`, 
        null
    ).setFooter({ text: `Page ${page + 1} of ${totalPages} • Total: ${trackers.length} Users` });

    const optionsArr = await Promise.all(pageTrackers.map(async (t) => {
        const member = await guild.members.fetch(t.user_id).catch(() => null);
        const name = member ? member.displayName : `User ${t.user_id}`;
        return {
            label: name.substring(0, 100),
            value: t.user_id,
            description: `Tracking ${t.count} series`,
            emoji: '🔍'
        };
    }));

    const rows = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`track_view_select_${moderatorId}`)
                .setPlaceholder('Select a user to view their specific archives...')
                .addOptions(optionsArr)
        )
    ];

    if (totalPages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`track_view_prev_${moderatorId}_${page - 1}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`track_view_next_${moderatorId}_${page + 1}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages - 1)
        ));
    }

    return { embeds: [embed], components: rows };
};

/**
 * Renders a read-only view of a specific user's tracks for a moderator
 */
const renderUserDetailView = async (guild, moderatorId, targetUserId) => {
    const subs = await getUserTrackedAnime(guild.id, targetUserId);
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    const name = member ? member.displayName : `User ${targetUserId}`;

    const listText = subs.map(s => `• **${s.anime_title}**`).join('\n') || 'No active records found.';

    const embed = baseEmbed(`Archive Review: ${name}`, 
        `Viewing the specific observation list for **${name}**.\n\n${listText}`, 
        member ? member.user.displayAvatarURL() : null
    ).setFooter({ text: 'Moderator View • Read-Only Access' });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`track_view_back_${moderatorId}`)
                .setLabel('Back to Overview')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔙')
        )
    ];

    return { embeds: [embed], components: rows };
};

/**
 * Global Handler for Tracking Interactions
 */
const handleTrackInteraction = async (interaction) => {
    try {
        const { customId, user, guild } = interaction;
        
        // --- 1. "Track Anime" Button (from Search Results) ---
        if (customId.startsWith('track_anime_')) {
            try {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            } catch (e) { return; }

            const animeId = parseInt(customId.replace('track_anime_', ''));
            if (isNaN(animeId)) return;

            try {
                const media = await getMediaById(animeId);
                if (!media) {
                    return await interaction.followUp({ content: '❌ Misplaced Record: I could not retrieve details for this series.', flags: MessageFlags.Ephemeral });
                }

                const title = media.title.english || media.title.romaji;
                const res = await addTracker(guild.id, user.id, animeId, title);

                if (res.error) {
                    return await interaction.followUp({ content: '❌ Ink Spill: I failed to inscribe this tracking request.', flags: MessageFlags.Ephemeral });
                }

                await interaction.followUp({ 
                    content: `📖 **Observation Logged**\n\nI shall now monitor the airwaves for **${title}** and notify you immediately upon any new transmissions.`, 
                    flags: MessageFlags.Ephemeral 
                });
            } catch (e) {
                logger.error('Track Interaction Error (Button):', e, 'TrackHandlers');
                await handleInteractionError(interaction, e);
            }
            return;
        }

        // --- 2. Track interactions ---
        const parts = customId.split('_');
        const action = parts[1];
        const subAction = parts[2];
        const controllerId = parts[3]; 

        if (user.id !== controllerId) {
            return interaction.reply({ 
                content: '🔒 **Archival Restriction**\n\nThis interface is currently restricted to the patron who originally requested these records. Please initiate your own archival request, Reader.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // A. Standard Personal List Interactions
        if (action === 'untrack') {
            const animeId = parseInt(interaction.values[0]);
            await removeTracker(guild.id, user.id, animeId);
            const payload = await renderTrackList(guild.id, user.id, 0); 
            return interaction.update(payload);
        }

        if (action === 'prev' || action === 'next') {
            const page = parseInt(parts[4]);
            const payload = await renderTrackList(guild.id, user.id, page);
            return interaction.update(payload);
        }

        // B. Moderator View Interactions
        if (action === 'view') {
            if (subAction === 'select') {
                const targetUserId = interaction.values[0];
                const payload = await renderUserDetailView(guild, user.id, targetUserId);
                return interaction.update(payload);
            }

            if (subAction === 'back') {
                const payload = await renderGuildTrackView(guild, user.id, 0);
                return interaction.update(payload);
            }

            if (subAction === 'prev' || subAction === 'next') {
                const page = parseInt(parts[4]);
                const payload = await renderGuildTrackView(guild, user.id, page);
                return interaction.update(payload);
            }
        }
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
};

module.exports = { renderTrackList, renderGuildTrackView, handleTrackInteraction };
