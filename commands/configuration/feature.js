const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags } = require('discord.js');
const { 
    fetchConfig, 
    getUserColor, 
    getUserAvatarConfig, 
    getLinkedAnilist: retrieveLinkedUser, 
    getUserTitle, 
    getUserBannerConfig: retrieveBannerConfig,
    getLevelRoles,
    updateUserBannerConfig,
    clearUserBannerGlobally
} = require('../../utils/core/database');
const { generateWelcomeCard } = require('../../utils/generators/welcomeGenerator');
const { generateBingoCard } = require('../../utils/generators/bingoGenerator');
const { generateProfileCard } = require('../../utils/generators/profileGenerator');
const { getMediaById, getTrendingAnime, getTrendingManga, getTrendingMovies, getAniListProfile } = require('../../utils/services/anilistService');
const { getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { getDynamicUserTitle } = require('../../utils/core/userMeta');
const { sendNotifications } = require('../../utils/services/scheduler');
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
                            { name: '🔎 Search', value: 'search' },
                            { name: '👤 Profile', value: 'profile' }
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
                        const attachmentSolo = new AttachmentBuilder(bufferSolo, { name: `airing-test-solo-${media.id}.webp` });

                        // Scenario B: Community Trackers
                        const mockTrackers = [
                            { displayName: 'Alex', level: 85, avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
                            { displayName: 'Sami', level: 124, avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png' },
                            { displayName: 'Jordan', level: 42, avatarURL: 'https://cdn.discordapp.com/embed/avatars/2.png' },
                            { displayName: 'Casey', level: 10, avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png' },
                            { displayName: 'Taylor', level: 67, avatarURL: 'https://cdn.discordapp.com/embed/avatars/4.png' }
                        ];
                        const bufferCommunity = await generateAiringCard(media, { episode: nextEpNum }, mockTrackers, themeColor);
                        const attachmentCommunity = new AttachmentBuilder(bufferCommunity, { name: `airing-test-community-${media.id}.webp` });

                        // Scenario C: Final Episode
                        const mockFinalMedia = { ...media, episodes: nextEpNum };
                        const bufferFinal = await generateAiringCard(mockFinalMedia, { episode: nextEpNum }, [], themeColor);
                        const attachmentFinal = new AttachmentBuilder(bufferFinal, { name: `airing-test-final-${media.id}.webp` });

                        await interaction.editReply({ files: [attachmentSolo, attachmentCommunity, attachmentFinal] });
                        await interaction.followUp({
                            content: `🏁 **Visual Diagnostic Complete**\nGenerated cards (Solo, Community, and Final Episode) for **${media.title.english || media.title.romaji}**`,
                            flags: MessageFlags.Ephemeral
                        });

                        // Phase D: Live Simulation (Simulate one broadcast with a ping)
                        await interaction.followUp({ content: '📤 **Simulation**: Broadcasting live notification to this channel...', flags: MessageFlags.Ephemeral });
                        const episodeData = { episode: nextEpNum, airingAt: Math.floor(Date.now() / 1000), timeUntilAiring: 0 };
                        await sendNotifications(interaction.client, media, episodeData, { 
                            forceGuildId: interaction.guild.id, 
                            forceUserId: interaction.user.id,
                            forceChannelId: interaction.channel.id 
                        });

                    } catch (err) {
                        logger.error('Airing Test Failed:', err, 'FeatureCommand');
                        await interaction.followUp({ content: `❌ **Failed to generate airing cards**: ${err.message}` });
                    }
                }

                // --- BINGO TEST ---
                else if (type === 'bingo') {
                    const sizes = [3, 4, 5];
                    await interaction.editReply({ content: '🎯 **Bingo Diagnostic**: Generating all grid sizes (3x3, 4x4, 5x5)...' });

                    for (const size of sizes) {
                        try {
                            const dummyCard = {
                                title: `Season Bingo (${size}x${size})`,
                                size: size,
                                entries: Array.from({ length: size * size }, (_, i) => ({
                                    media_id: 1,
                                    title: `Anime ${i + 1}`,
                                    cover_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                                }))
                            };

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
                        // ── Basic Anime Variants ──
                        { status: 'watched episode', progress: '12', score: 8.5, format: 'TV' },
                        { status: 'completed', score: 9.5, format: 'TV' },
                        
                        // ── Binge Variants ──
                        { status: 'watched episode', progress: '1-10', score: 9, format: 'TV' },
                        { status: 'read chapter', progress: '100-115', score: 8.5, mediaType: 'MANGA', format: 'MANGA' },
                        
                        // ── State Variants ──
                        { status: 'paused watching', progress: null, score: 7, format: 'TV' },
                        { status: 'rewatched episode', progress: '4', score: 9.5, format: 'TV' },
                        { status: 'dropped', score: 2, format: 'TV' },
                        
                        // ── Score & Release Variants ──
                        { status: 'plans to watch', score: null, format: 'TV', statusMedia: 'NOT_YET_RELEASED' }, // Unreleased
                        { status: 'watched episode', progress: '5', score: null, format: 'TV' }, // Released, no score
                        
                        // ── NSFW / Adult Variants (Spoilered) ──
                        { status: 'watched episode', progress: '1', score: 8, format: 'TV', isAdult: true },
                        { status: 'read chapter', progress: '69', score: 9, mediaType: 'MANGA', format: 'MANGA', isAdult: true },
                        
                        // ── Movie & OVA ──
                        { status: 'watched movie', progress: null, score: 9.8, format: 'MOVIE' },
                        { status: 'watched episode', progress: '3', score: 7.5, format: 'OVA' },
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
                                format: s.format || (isManga ? 'MANGA' : 'TV'),
                                status: s.statusMedia || mockMedia.status,
                                isAdult: s.isAdult || false,
                                meanScore: s.score !== null ? s.score * 10 : null
                            },
                            status: s.status,
                            progress: s.progress,
                            score: s.score === undefined ? (s.status.includes('planning') ? null : (Math.floor(Math.random() * 4) + 7)) : s.score
                        };

                        try {
                            const buffer = await generateActivityCard(userMeta, activityData);
                            const aName = s.isAdult ? `SPOILER_activity-${i}.webp` : `activity-${i}.webp`;
                            attachments.push(new AttachmentBuilder(buffer, { name: aName }));
                        } catch (err) {
                            logger.error(`Batch Gen Failed for ${s.status} (${s.format}):`, err, 'FeatureTest');
                        }
                    }

                    // Send in chunks of 4
                    for (let i = 0; i < attachments.length; i += 4) {
                        const chunk = attachments.slice(i, i + 4);
                        await interaction.followUp({
                            content: i === 0 ? '🏁 **Activity Feed Generation Complete!**' : '',
                            files: chunk 
                        });
                    }
                }

                // --- PROFILE TEST ---
                else if (type === 'profile') {
                    const targetUser = query ? (await interaction.guild.members.fetch(query)).user : interaction.user;
                    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    
                    await interaction.editReply({ content: `👤 **Profile Diagnostic**: Simulating **Standard** and **Premium** cards for **${targetUser.username}**...` });

                    const guildId = interaction.guild.id;
                    const [rankData, linkedUsername, backgroundUrl, title, color, avatarConfig, levelRoles] = await Promise.all([
                        getUserRank(targetUser.id, guildId),
                        retrieveLinkedUser(targetUser.id, guildId),
                        retrieveBackground(targetUser.id, guildId),
                        getUserTitle(targetUser.id, guildId),
                        getUserColor(targetUser.id, guildId),
                        getUserAvatarConfig(targetUser.id, guildId),
                        getLevelRoles(guildId)
                    ]);

                    const xp = rankData ? parseInt(rankData.xp) : 0;
                    const level = rankData ? parseInt(rankData.level) : 0;
                    const progress = getLevelProgress(xp, level);

                    // Muse Rank Calculation
                    const earnedRoles = levelRoles.filter(lr => lr.level <= level);
                    let knowledgeRank = 'Muse Reader';
                    let rankColor = color || THEME_COLOR;

                    if (earnedRoles.length > 0) {
                        const highestRole = earnedRoles[earnedRoles.length - 1];
                        const roleObj = interaction.guild.roles.cache.get(highestRole.role_id) || await interaction.guild.roles.fetch(highestRole.role_id).catch(() => null);
                        if (roleObj) {
                            knowledgeRank = roleObj.name.replace(/^\d+\s*[|-]\s*/, '').trim();
                            if (roleObj.color) rankColor = `#${roleObj.color.toString(16).padStart(6, '0')}`;
                        }
                    }

                    const joinedDate = member ? member.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
                    const messages = Math.floor(xp / 20);

                    // AniList Data
                    let anilistStats = { completed: 0, days: 0, meanScore: 0 };
                    let favorites = [];
                    if (linkedUsername) {
                        const { stats, favorites: favs, avatar } = await getAniListProfile(linkedUsername);
                        if (stats) anilistStats = stats;
                        if (favs) favorites = favs;
                        if (avatarConfig && avatarConfig.source === 'ANILIST') avatarConfig.anilistAvatar = avatar;
                    }

                    const baseUser = {
                        xp, level, rank: rankData ? rankData.rank : '?',
                        current: progress.current, required: progress.required, percent: progress.percent,
                        title: (title && !title.includes('Muse')) ? title : knowledgeRank.toUpperCase(),
                        rankColor,
                        joinedDate, messages, knowledgeRank,
                        anilist_synced: !!linkedUsername, anilist: anilistStats,
                        avatarConfig, guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : targetUser.displayAvatarURL({ extension: 'png' })
                    };

                    const displayName = member ? member.displayName : targetUser.username;
                    const isBooster = member ? member.roles.cache.some(r => r.name.toLowerCase().includes('sacred muse')) : false;
                    
                    // Generate Hexa-View Scenario Matrix
                    const tasks = [
                        { label: 'Standard Linked', data: { ...baseUser, is_premium: false, is_booster: false, anilist_synced: !!linkedUsername }, name: 'standard' },
                        { label: 'Premium Linked', data: { ...baseUser, is_premium: true, is_booster: false, anilist_synced: !!linkedUsername }, name: 'premium' },
                        { label: 'Booster Linked', data: { ...baseUser, is_premium: false, is_booster: true, anilist_synced: !!linkedUsername, rankColor: '#A855F7' }, name: 'booster' },
                        { label: 'Standard Compact', data: { ...baseUser, is_premium: false, is_booster: false, anilist_synced: false }, name: 'standard-compact' },
                        { label: 'Premium Compact', data: { ...baseUser, is_premium: true, is_booster: false, anilist_synced: false }, name: 'premium-compact' },
                        { label: 'Booster Compact', data: { ...baseUser, is_premium: false, is_booster: true, anilist_synced: false, rankColor: '#A855F7' }, name: 'booster-compact' }
                    ];

                    const attachments = [];
                    for (const task of tasks) {
                        const buffer = await generateProfileCard(
                            targetUser, task.data, favorites, backgroundUrl, color || '#FFACD1', displayName,
                            async () => await clearUserBannerGlobally(targetUser.id)
                        );
                        attachments.push(new AttachmentBuilder(buffer, { name: `profile-${task.name}-${targetUser.id}.webp` }));
                    }

                    await interaction.editReply({ 
                        content: `✅ **Profile Diagnostic Complete**\nGenerated **Full Tier Matrix** (Standard, Premium, Booster) for ${targetUser}.`,
                        files: attachments 
                    });
                }

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
                        const buffer = await generateSearchCard(media);
                        const attachment = new AttachmentBuilder(buffer, { name: `search-${media.id}.webp` });
                        await interaction.editReply({ files: [attachment] });
                    } catch (err) {
                        logger.error('Search Test Failed:', err, 'FeatureCommand');
                        await interaction.followUp({ content: `❌ **Failed to generate search card**: ${err.message}` });
                    }
                }

            } catch (error) {
                logger.error('Diagnostic Command Error:', error, 'FeatureCommand');
                await interaction.editReply({ content: `❌ **Fatal Diagnostic Error**: ${error.message}` });
            }
        }
    },
};
