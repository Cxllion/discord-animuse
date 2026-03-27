const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags } = require('discord.js');
const { fetchConfig } = require('../../utils/core/database');
const { generateWelcomeCard } = require('../../utils/generators/welcomeGenerator');
const { generateBingoCard } = require('../../utils/generators/bingoGenerator');
const { getMediaById, getTrendingAnime, getTrendingManga, getTrendingMovies, getAniListProfile } = require('../../utils/services/anilistService');
const { sendNotifications } = require('../../utils/services/scheduler');
const { getUserColor, getUserAvatarConfig, getLinkedAnilist, getUserTitle } = require('../../utils/core/database');
const logger = require('../../utils/core/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feature')
        .setDescription('Test and verify AniMuse features.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Run a diagnostic test for a specific feature.')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('The feature to test.')
                        .setRequired(true)
                        .addChoices(
                            { name: '✨ Welcome', value: 'welcome' },
                            { name: '📢 Airing', value: 'airing' },
                            { name: '🎯 Bingo', value: 'bingo' },
                            { name: '🔔 Activity', value: 'activity' },
                            { name: '🔎 Search', value: 'search' }
                        ))
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Target ID (User ID or Anime ID).')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'test') {
            await interaction.deferReply();
            const type = interaction.options.getString('type');
            const query = interaction.options.getString('query');

            try {
                // --- WELCOME TEST ---
                if (type === 'welcome') {
                    // 1. Resolve Member
                    let member;
                    try {
                        member = query
                            ? await interaction.guild.members.fetch(query)
                            : interaction.member;
                    } catch (e) {
                        return await interaction.editReply({ content: `❌ **Error**: Could not find a member with ID \`${query}\`.` });
                    }

                    // 2. Resolve Target Channel
                    const config = await fetchConfig(interaction.guild.id);
                    if (!config || !config.welcome_channel_id) {
                        return await interaction.editReply({ content: `❌ **Configuration Missing**: No 'Welcome' channel is set. Use \`/channel assign\` first.` });
                    }

                    const channel = interaction.guild.channels.cache.get(config.welcome_channel_id);
                    if (!channel) {
                        return await interaction.editReply({ content: `❌ **Error**: The configured Welcome Channel (<#${config.welcome_channel_id}>) no longer exists.` });
                    }

                    // 3. Generate Card
                    await interaction.editReply({ content: `⏳ **Generating** welcome card for **${member.user.username}**...` });
                    const buffer = await generateWelcomeCard(member);
                    const attachment = new AttachmentBuilder(buffer, { name: 'welcome-test.webp' });

                    // 4. Send to Channel
                    const sentMsg = await channel.send({
                        content: `**[Feature Test]** Simulation for ${member} (${member.id})`,
                        files: [attachment]
                    });

                    // 5. Report Success
                    return await interaction.editReply({
                        content: `✅ **Test Successful**\nGenerated and sent welcome card to ${channel}.\n[Jump to Message](${sentMsg.url})`
                    });
                }

                // --- AIRING TEST ---
                else if (type === 'airing') {
                    let media;
                    let mediaId;

                    if (query) {
                        mediaId = parseInt(query);
                        if (isNaN(mediaId)) {
                            return await interaction.editReply({ content: '❌ **Error**: ID must be a number.' });
                        }
                        // Manual Mode: Need to fetch
                        await interaction.editReply({ content: `⏳ **Fetching** data for Anime ID: \`${mediaId}\`...` });
                        media = await getMediaById(mediaId);
                        if (!media) {
                            return await interaction.editReply({ content: '❌ **Error**: Media not found on AniList.' });
                        }

                    } else {
                        // Random Mode (Optimized)
                        await interaction.editReply({ content: '🎲 **Random Mode**: Picking a trending anime...' });
                        const trending = await getTrendingAnime();
                        if (!trending.length) {
                            return await interaction.editReply({ content: '❌ **Error**: Could not fetch trending anime.' });
                        }
                        // Data from getTrendingAnime is now sufficient for card generation
                        media = trending[Math.floor(Math.random() * trending.length)];
                    }

                    const nextEpNum = (media.nextAiringEpisode?.episode) || (media.episodes ? media.episodes + 1 : 12);
                    const { generateAiringCard } = require('../../utils/generators/airingGenerator');

                    await interaction.editReply({ content: `✅ **Airing Graphic Diagnostic**: **${media.title.english || media.title.romaji}**\n🎨 Generating solo and community variants...` });

                    try {
                        const themeColor = await getUserColor(interaction.member.id, interaction.guild.id) || '#FFACD1';
                        
                        // Scenario A: Solo Airing
                        const bufferSolo = await generateAiringCard(media, { episode: nextEpNum }, [], themeColor);
                        const attachmentSolo = new AttachmentBuilder(bufferSolo, { name: 'airing-test-solo.webp' });

                        // Scenario B: Community Trackers
                        const mockTrackers = [
                            { displayName: 'Alex', level: 85, avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
                            { displayName: 'Sami', level: 124, avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png' },
                            { displayName: 'Jordan', level: 42, avatarURL: 'https://cdn.discordapp.com/embed/avatars/2.png' },
                            { displayName: 'Casey', level: 10, avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png' },
                            { displayName: 'Taylor', level: 67, avatarURL: 'https://cdn.discordapp.com/embed/avatars/4.png' }
                        ];
                        const bufferCommunity = await generateAiringCard(media, { episode: nextEpNum }, mockTrackers, themeColor);
                        const attachmentCommunity = new AttachmentBuilder(bufferCommunity, { name: 'airing-test-community.webp' });

                        // Scenario C: Final Episode
                        const mockFinalMedia = { ...media, episodes: nextEpNum };
                        const bufferFinal = await generateAiringCard(mockFinalMedia, { episode: nextEpNum }, [], themeColor);
                        const attachmentFinal = new AttachmentBuilder(bufferFinal, { name: 'airing-test-final.webp' });

                        await interaction.editReply({ files: [attachmentSolo, attachmentCommunity, attachmentFinal] });
                        await interaction.followUp({
                            content: `🏁 **Visual Diagnostic Complete**\nGenerated cards (Solo, Community, and Final Episode) for **${media.title.english || media.title.romaji}**`,
                            flags: MessageFlags.Ephemeral
                        });

                        // Phase D: Live Simulation (Simulate one broadcast with a ping)
                        await interaction.followUp({ content: '📤 **Simulation**: Broadcasting live notification to your airing channel...', flags: MessageFlags.Ephemeral });
                        const episodeData = { episode: nextEpNum, airingAt: Math.floor(Date.now() / 1000), timeUntilAiring: 0 };
                        await sendNotifications(interaction.client, media, episodeData, { forceGuildId: interaction.guild.id, forceUserId: interaction.user.id });

                    } catch (e) {
                        logger.error('Airing Test Error:', e.message, 'FeatureCommand');
                        await interaction.followUp({ content: `❌ **Diagnostic Failed**: ${e.message}`, flags: MessageFlags.Ephemeral });
                    }
                }

                // --- BINGO TEST ---
                else if (type === 'bingo') {
                    // Generate dummy cards for ALL sizes (2x2 to 5x5)
                    await interaction.editReply({ content: '🚀 **Starting Bingo Generation Sequence** (All Interactive layouts)...' });

                    const trending = await getTrendingAnime();
                    const sizes = [2, 3, 4, 5];

                    for (const size of sizes) {
                        try {
                            // Create Entries
                            const entries = [];
                            const maxItems = size * size;

                            for (let i = 0; i < maxItems; i++) {
                                const m = trending[i % trending.length];
                                if (m) {
                                    entries.push({
                                        title: m.title.english || m.title.romaji,
                                        coverImage: m.coverImage.extraLarge || m.coverImage.large,
                                        filledAt: new Date().toISOString()
                                    });
                                } else {
                                    entries.push(null);
                                }
                            }

                            const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
                            const dummyCard = {
                                title: `${interaction.member.user.username.toUpperCase()}'S ${dateStr} BINGO`,
                                size: size,
                                entries: entries
                            };

                            // Resolve Avatar
                            let avatarUrl = interaction.member.user.displayAvatarURL({ extension: 'png' });
                            const avatarConfig = await getUserAvatarConfig(interaction.member.id, interaction.guild.id);
                            if (avatarConfig) {
                                if (avatarConfig.source === 'CUSTOM' && avatarConfig.customAvatarUrl) {
                                    avatarUrl = avatarConfig.customAvatarUrl;
                                } else if (avatarConfig.source === 'ANILIST') {
                                    const linkedUser = await getLinkedAnilist(interaction.member.id, interaction.guild.id);
                                    if (linkedUser) {
                                        const { avatar } = await getAniListProfile(linkedUser);
                                        if (avatar) avatarUrl = avatar;
                                    }
                                } else if (avatarConfig.source === 'DISCORD_GUILD') {
                                    avatarUrl = interaction.member.displayAvatarURL({ extension: 'png' });
                                }
                            }
                            const themeColor = await getUserColor(interaction.member.id, interaction.guild.id) || '#FFACD1';

                            const buffer = await generateBingoCard(dummyCard, interaction.member.user, themeColor, avatarUrl);
                            const attachment = new AttachmentBuilder(buffer, { name: `bingo-${size}x${size}.webp` });

                            await interaction.followUp({
                                content: `✅ **Generated ${size}x${size} Layout**`,
                                files: [attachment]
                            });

                        } catch (e) {
                            logger.error(`Failed to generate ${size}x${size}:`, e, 'FeatureCommand');
                            await interaction.followUp({ content: `❌ Failed to generate ${size}x${size}: ${e.message}` });
                        }

                    }
                    await interaction.followUp({ content: '🏁 **Bingo Test Sequence Complete**' });
                }

                // --- ACTIVITY GRAPHICS TEST ---
                else if (type === 'activity') {
                    await interaction.editReply({ content: '🎨 **Generating All Activity Feed States**...' });
                    
                    // Fetch trending items mix
                    const trendingAnime = await getTrendingAnime();
                    const trendingManga = await getTrendingManga();
                    const trendingMovies = await getTrendingMovies();
                    const trending = [...trendingAnime, ...trendingManga];

                    // Resolve User Avatar
                    let avatarUrl = interaction.member.displayAvatarURL({ extension: 'png' });
                    const avatarConfig = await getUserAvatarConfig(interaction.member.id, interaction.guild.id);
                    if (avatarConfig) {
                        if (avatarConfig.source === 'CUSTOM' && avatarConfig.customAvatarUrl) {
                            avatarUrl = avatarConfig.customAvatarUrl;
                        } else if (avatarConfig.source === 'ANILIST') {
                            const linkedUser = await getLinkedAnilist(interaction.member.id, interaction.guild.id);
                            if (linkedUser) {
                                const { avatar } = await getAniListProfile(linkedUser);
                                if (avatar) avatarUrl = avatar;
                            }
                        }
                    }

                    const themeColor = await getUserColor(interaction.member.id, interaction.guild.id) || '#FFACD1';

                    // Prepare Mock User Data
                    const userMeta = {
                        username: interaction.member.user.username || 'Testing',
                        avatarUrl: avatarUrl,
                        themeColor: themeColor,
                        title: await getUserTitle(interaction.member.id, interaction.guild.id)
                    };

                    const mockActivities = [
                        // ── Anime Variants ──
                        { status: 'watched episode', progress: '12', score: 8.5, format: 'TV' },
                        { status: 'watched episode', progress: '1-12', score: 9.2, format: 'TV' }, // Binge
                        { status: 'completed', score: 9.5, format: 'TV' },
                        { status: 'dropped', score: 3, format: 'TV' },
                        { status: 'planning to watch', score: null, format: 'TV' },
                        // ── Movie ──
                        { status: 'watched movie', progress: null, score: 9.8, format: 'MOVIE' },
                        { status: 'completed', score: 10, format: 'MOVIE' },
                        // ── OVA / ONA / Special ──
                        { status: 'watched episode', progress: '3', score: 7.5, format: 'OVA' },
                        { status: 'watched episode', progress: '6', score: 8, format: 'ONA' },
                        { status: 'completed', score: 8.2, format: 'SPECIAL' },
                        // ── Manga Variants ──
                        { status: 'read chapter', progress: '42', score: 9, mediaType: 'MANGA', format: 'MANGA' },
                        { status: 'read chapter', progress: '10-15', score: 8.8, mediaType: 'MANGA', format: 'MANGA' }, // Binge
                        { status: 'read volume', progress: '3', score: 8, mediaType: 'MANGA', format: 'MANGA' },
                        { status: 'completed', score: 10, mediaType: 'MANGA', format: 'MANGA' },
                        { status: 'dropped', score: 2, mediaType: 'MANGA', format: 'MANGA' },
                        // ── No-Score Variants ──
                        { status: 'watched episode', progress: '5', score: null, format: 'TV' },
                        { status: 'read chapter', progress: '20', score: null, mediaType: 'MANGA', format: 'MANGA' },
                    ];
                    
                    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
                    const shuffledAnime = shuffle([...trendingAnime]);
                    const shuffledManga = shuffle([...trendingManga]);
                    const shuffledMovies = shuffle([...trendingMovies]);

                    const { generateActivityCard } = require('../../utils/generators/activityGenerator');
                    const attachments = [];

                    for (let i = 0; i < mockActivities.length; i++) {
                        const s = mockActivities[i];
                        const isManga = s.mediaType === 'MANGA' || s.status.includes('read');
                        const isMovie = s.format === 'MOVIE';
                        const pool = isManga ? shuffledManga : isMovie ? shuffledMovies : shuffledAnime;
                        const mockMedia = pool[i % pool.length] || pool[0] || {};
                        
                        const activityData = {
                            media: { 
                                ...mockMedia, 
                                type: isManga ? 'MANGA' : 'ANIME',
                                format: s.format || (isManga ? 'MANGA' : 'TV')
                            },
                            status: s.status,
                            progress: s.progress,
                            score: s.score === undefined ? (s.status.includes('planning') ? null : (Math.floor(Math.random() * 4) + 7)) : s.score
                        };

                        try {
                            const buffer = await generateActivityCard(userMeta, activityData);
                            attachments.push(new AttachmentBuilder(buffer, { name: `activity-${i}-${s.format || 'tv'}-${s.status.replace(/\s+/g, '-')}.webp` }));
                        } catch (err) {
                            logger.error(`Batch Gen Failed for ${s.status} (${s.format}):`, err, 'FeatureTest');
                        }
                    }

                    // Send in chunks of 4 for better UI and to avoid rate limits/attachment limits
                    for (let i = 0; i < attachments.length; i += 4) {
                        const chunk = attachments.slice(i, i + 4);
                        await interaction.followUp({
                            content: i === 0 ? '🏁 **Activity Feed Generation Complete!**' : '',
                            files: chunk 
                        });
                    }
                }

                // --- SEARCH CARD TEST ---
                else if (type === 'search') {
                    let media;
                    let mediaId;

                    if (query) {
                        mediaId = parseInt(query);
                        if (isNaN(mediaId)) {
                            return await interaction.editReply({ content: '❌ **Error**: ID must be a number.' });
                        }
                        await interaction.editReply({ content: `⏳ **Fetching** data for Media ID: \`${mediaId}\`...` });
                        media = await getMediaById(mediaId);
                        if (!media) {
                            return await interaction.editReply({ content: '❌ **Error**: Media not found on AniList.' });
                        }
                    } else {
                        await interaction.editReply({ content: '🎲 **Random Mode**: Picking a trending anime...' });
                        const trending = await getTrendingAnime();
                        if (!trending.length) {
                            return await interaction.editReply({ content: '❌ **Error**: Could not fetch trending anime.' });
                        }
                        media = trending[Math.floor(Math.random() * trending.length)];
                    }

                    const { generateSearchCard } = require('../../utils/generators/searchGenerator');
                    await interaction.editReply({ content: `✅ **Search Graphic Diagnostic**: **${media.title.english || media.title.romaji}**\n🎨 Generating premium cinematic card...` });

                    try {
                        const themeColor = await getUserColor(interaction.member.id, interaction.guild.id) || '#FFACD1';
                        
                        // Scenario: Full Search Card
                        const buffer = await generateSearchCard(media, themeColor);
                        const attachment = new AttachmentBuilder(buffer, { name: `search-test-${media.id}.webp` });

                        await interaction.followUp({
                            content: `🏁 **Visual Diagnostic Complete**\nGenerated search result card for **${media.title.english || media.title.romaji}** (${media.format || 'TV'})`,
                            files: [attachment]
                        });

                    } catch (e) {
                        logger.error('Search Test Error:', e.message, 'FeatureCommand');
                        await interaction.followUp({ content: `❌ **Diagnostic Failed**: ${e.message}`, flags: MessageFlags.Ephemeral });
                    }
                }

            } catch (error) {
                logger.error('Command Error: /feature test', error, 'FeatureCommand');
                await interaction.editReply({ content: '❌ An internal error occurred while running the diagnostic.' });
            }
        }
    },
};
