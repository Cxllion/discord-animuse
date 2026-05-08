const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTopUsers, getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { generateLeaderboard } = require('../../utils/generators/leaderboardGenerator');
const { generateMinigameLeaderboard } = require('../../utils/generators/minigameLeaderboardGenerator');
const { getUserBannerConfig, getUserColor, getUserTitle, getBulkUserAvatarConfig, minigameService, fetchConfig } = require('../../utils/core/database');
const { getAnilistUser } = require('../../utils/services/anilistService');
const { getResolvableName } = require('../../utils/core/visualUtils');

module.exports = {
    category: 'social',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the High Council of Scholars or Minigame Champions.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The archive to view.')
                .setRequired(false)
                .addChoices(
                    { name: '✨ Experience', value: 'exp' },
                    { name: '🎯 Minigames', value: 'minigames' }
                ))
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('The page of the archives to view.')
                .setMinValue(1)
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();
        const type = interaction.options.getString('type') || 'exp';
        
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        const loadingMsg = type === 'exp' ? 'Ranking High Council...' : 'Synchronizing Minigame Archives...';
        loader.startProgress(loadingMsg, 5);

        const guildId = interaction.guild.id;

        if (type === 'minigames') {
            // --- MINIGAMES LEADERBOARD LOGIC ---
            try {
                const [topPlayers, challengerStats, color] = await Promise.all([
                    minigameService.getTopPlayers(10),
                    minigameService.getUserStats(interaction.user.id),
                    getUserColor(interaction.user.id, guildId)
                ]);

                // 1. Resolve Avatars & Names for top players
                const topWithDetails = [];
                const members = await interaction.guild.members.fetch({ user: [...topPlayers.map(u => u.user_id), interaction.user.id] }).catch(() => new Map());
                const avatarConfigs = await getBulkUserAvatarConfig(guildId, [...topPlayers.map(u => u.user_id), interaction.user.id]);

                // 2. Fetch AniList Avatars if needed
                const anilistMap = {};
                const anilistToFetch = [...new Set(Object.values(avatarConfigs).filter(c => c.source === 'ANILIST' && c.anilistUsername).map(c => c.anilistUsername))];
                if (anilistToFetch.length > 0) {
                    await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                        if (data && data.avatar) anilistMap[username] = data.avatar.large;
                    })));
                }

                const resolveAvatar = (userId, member) => {
                    const config = avatarConfigs[userId];
                    const discordUrl = member ? member.user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
                    
                    if (!config) return [discordUrl];

                    let priorityUrl = null;
                    if (config.source === 'CUSTOM') priorityUrl = config.customUrl;
                    else if (config.source === 'ANILIST') priorityUrl = anilistMap[config.anilistUsername];
                    else if (config.source === 'DISCORD_GUILD' && member) priorityUrl = member.displayAvatarURL({ extension: 'png', size: 512 });

                    return [priorityUrl, discordUrl].filter(u => u);
                };

                const config = await fetchConfig(guildId);
                for (const player of topPlayers) {
                    const member = members.get(player.user_id);
                    topWithDetails.push({
                        ...player,
                        username: member ? getResolvableName(member) : 'Unknown Archivist',
                        avatarUrl: resolveAvatar(player.user_id, member),
                        isBooster: member ? !!member.premiumSinceTimestamp : false,
                        isPremium: member ? (
                            member.permissions.has('Administrator') || 
                            (config.premium_role_id && member.roles.cache.has(config.premium_role_id)) ||
                            member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                        ) : false
                    });
                }

                const challengerAvatarUrl = resolveAvatar(interaction.user.id, interaction.member);
                const challengerName = getResolvableName(interaction.member);
                
                const challengerData = {
                    username: challengerName,
                    avatarUrl: challengerAvatarUrl,
                    stats: challengerStats
                };

                const buffer = await generateMinigameLeaderboard(challengerData, topWithDetails, color);
                const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard_minigames.webp' });

                return await loader.stop({ files: [attachment] });
            } catch (error) {
                const logger = require('../../utils/core/logger');
                logger.error('Minigame Leaderboard Failed:', error);
                return await loader.stop({ content: '❌ **Protocol Failure:** Could not materialize the minigame archives.' });
            }
        }

        // --- EXP LEADERBOARD LOGIC ---
        let currentPage = interaction.options.getInteger('page') || 1;

        // 1. PRE-FETCH STATIC CONTENT (podium, config, challenger data)
        // This data never changes during the lifecycle of the command session.
        const [top3Raw, config, rankData, bgUrl, color, userTitle] = await Promise.all([
            getTopUsers(guildId, 3, 0),
            fetchConfig(guildId),
            getUserRank(interaction.user.id, guildId),
            getUserBannerConfig(interaction.user.id, guildId),
            getUserColor(interaction.user.id, guildId),
            getUserTitle(interaction.user.id, guildId)
        ]);

        const isChallengerBooster = interaction.member ? !!interaction.member.premiumSinceTimestamp : false;
        const isChallengerPremium = interaction.member ? (
            interaction.member.permissions.has('Administrator') || 
            (config.premium_role_id && interaction.member.roles.cache.has(config.premium_role_id)) ||
            interaction.member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
        ) : false;

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        const challengerData = {
            rank: rankData ? rankData.rank : '?',
            level, xp, current: progress.current, required: progress.required,
            percent: progress.percent, title: userTitle || null,
            isBooster: isChallengerBooster,
            isPremium: isChallengerPremium
        };
        const challengerName = getResolvableName(interaction.member);

        // Persistent Cache for Avatars (Podium avatars stay the same)
        const globalAnilistMap = {};

        const renderExpPage = async (page) => {
            const listOffset = 3 + (page - 1) * 7;
            const listRaw = await getTopUsers(guildId, 7, listOffset);
            const topRaw = [...top3Raw, ...listRaw];

            // 2. Resolve Avatars & Details (Incremental Fetch)
            const topUsers = [];
            const userIds = [...new Set([...topRaw.map(u => u.user_id), interaction.user.id])];
            const [members, avatarConfigs] = await Promise.all([
                interaction.guild.members.fetch({ user: userIds }).catch(() => new Map()),
                getBulkUserAvatarConfig(guildId, userIds)
            ]);

            // 3. Optimized AniList Fetch (Only fetch new ones)
            const anilistToFetch = [...new Set(Object.values(avatarConfigs)
                .filter(c => c.source === 'ANILIST' && c.anilistUsername && !globalAnilistMap[c.anilistUsername])
                .map(c => c.anilistUsername))];
            
            if (anilistToFetch.length > 0) {
                await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                    if (data && data.avatar) globalAnilistMap[username] = data.avatar.large;
                })));
            }

            const resolveAvatar = (userId, member) => {
                const cfg = avatarConfigs[userId];
                const discordUrl = member ? member.user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
                if (!cfg) return [discordUrl];
                
                let priorityUrl = null;
                if (cfg.source === 'CUSTOM') priorityUrl = cfg.customUrl;
                else if (cfg.source === 'ANILIST') priorityUrl = globalAnilistMap[cfg.anilistUsername];
                else if (cfg.source === 'DISCORD_GUILD' && member) priorityUrl = member.displayAvatarURL({ extension: 'png', size: 512 });

                return [priorityUrl, discordUrl].filter(u => u);
            };

            for (const raw of topRaw) {
                const member = members.get(raw.user_id);
                topUsers.push({
                    ...raw,
                    username: member ? getResolvableName(member) : 'Unknown User',
                    avatarUrl: resolveAvatar(raw.user_id, member),
                    isBooster: member ? !!member.premiumSinceTimestamp : false,
                    isPremium: member ? (
                        member.permissions.has('Administrator') || 
                        (config.premium_role_id && member.roles.cache.has(config.premium_role_id)) ||
                        member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                    ) : false
                });
            }

            const challengerAvatarUrl = resolveAvatar(interaction.user.id, interaction.member);
            const buffer = await generateLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, challengerName, challengerAvatarUrl, page);
            
            return { buffer, listRawCount: listRaw.length };
        };

        const updateMessage = async (page) => {
            const { buffer, listRawCount } = await renderExpPage(page);
            const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.webp' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('local_leaderboard_prev')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('local_leaderboard_next')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(listRawCount < 7)
            );

            return { files: [attachment], components: [row] };
        };

        const initialPayload = await updateMessage(currentPage);
        const message = await loader.stop(initialPayload);

        const collector = message.createMessageComponentCollector({ time: 300000 });
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Only the summoner can flip the pages.', ephemeral: true });
            
            if (i.customId === 'local_leaderboard_prev') currentPage--;
            else if (i.customId === 'local_leaderboard_next') currentPage++;

            await i.deferUpdate();
            const newPayload = await updateMessage(currentPage);
            await i.editReply(newPayload);
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('local_leaderboard_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('local_leaderboard_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
