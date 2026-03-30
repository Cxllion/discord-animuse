const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { getMediaById, getMediaByIds } = require('../services/anilistService');
const { getUserTrackedAnime, removeTracker, addTracker } = require('../core/database');
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
            embeds: [baseEmbed().setTitle('Archive Empty').setDescription('🍂 **Your Tracking Scroll is Empty**\n\nThe archives show no records under your name.')], 
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

    const embed = baseEmbed()
        .setTitle('Tracing Archives: Observation List')
        .setDescription(`Viewing your currently tracked collection. You will receive notifications for these series when new episodes arrive.\n\n${listText}`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total: ${subs.length} Series` });

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
 * Global Handler for Tracking Interactions
 */
const handleTrackInteraction = async (interaction) => {
    const { customId, user, guild } = interaction;
    
    // --- 1. "Track Anime" Button (from Search Results) ---
    // Pattern: track_anime_ID
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
        }
        return;
    }

    // --- 2. Track List Interactions (Pagination & Untracking) ---
    // Patterns: track_untrack_select_USERID, track_prev_page_USERID_PAGE, etc.
    const parts = customId.split('_');
    const action = parts[1];
    const ownerId = parts[3];

    if (user.id !== ownerId) {
        return interaction.reply({ 
            content: '🔒 Only the archivist who requested this list may turn these pages.', 
            flags: MessageFlags.Ephemeral 
        });
    }

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
};

module.exports = { renderTrackList, handleTrackInteraction };
