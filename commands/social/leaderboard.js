const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/core/logger');
const { getTopUsers, getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { generateLeaderboard } = require('../../utils/generators/leaderboardGenerator');
const { generateMinigameLeaderboard } = require('../../utils/generators/minigameLeaderboardGenerator');
const { getUserBannerConfig, getUserColor, getUserTitle, getBulkUserAvatarConfig, getBulkUserTitles, minigameService, fetchConfig } = require('../../utils/core/database');
const { getAnilistUser } = require('../../utils/services/anilistService');
const { getResolvableName } = require('../../utils/core/visualUtils');

module.exports = {
    category: 'social',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the High Council of Scholars or Arcade Champions.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The archive to view.')
                .setRequired(false)
                .addChoices(
                    { name: '✨ Experience', value: 'exp' },
                    { name: '🎯 Arcade', value: 'arcade' },
                    { name: '🎯 Minigames (Legacy)', value: 'minigames' }
                ))
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('The page of the archives to view.')
                .setMinValue(1)
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();
        let type = interaction.options.getString('type') || 'exp';
        if (type === 'minigames') type = 'arcade'; // Protocol Bridge
        let currentPage = interaction.options.getInteger('page') || 1;
        const guildId = interaction.guild.id;

        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        const CONFIG = require('../../utils/config');

        const loadingMsg = type === 'exp' ? 'Ranking High Council...' : 'Synchronizing Arcade Archives...';
        loader.startProgress(loadingMsg, 5);

        // --- COMMON RESOLVER: Avatars & Names ---
        const resolveAvatar = (userId, member, avatarConfigs, anilistMap) => {
            const config = avatarConfigs[userId];
            const discordUrl = member?.user ? member.user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
            if (!config) return [discordUrl].filter(Boolean);

            let priorityUrl = null;
            if (config.source === 'CUSTOM') priorityUrl = config.customUrl;
            else if (config.source === 'ANILIST') priorityUrl = anilistMap[config.anilistUsername];
            else if (config.source === 'DISCORD_GUILD' && member) priorityUrl = member.displayAvatarURL({ extension: 'png', size: 512 });

            return [priorityUrl, discordUrl].filter(u => u);
        };

        const updateMessage = async (page) => {
            try {
                if (type === 'arcade') {
                    const listOffset = 3 + (page - 1) * 7;
                    const [top3Raw, listRaw, challengerStats, color, guildConfig, bgUrl, userTitle] = await Promise.all([
                        minigameService.getTopPlayers(3, 0).catch(() => []),
                        minigameService.getTopPlayers(7, listOffset).catch(() => []),
                        minigameService.getUserStats(interaction.user.id).catch(() => ({ total_points: 0, rank: '?', games_played: 0 })),
                        getUserColor(interaction.user.id, guildId).catch(() => CONFIG.COLORS.PRIMARY),
                        fetchConfig(guildId).catch(() => ({})),
                        getUserBannerConfig(interaction.user.id, guildId).catch(() => ({ source: 'PRESET', customUrl: null })),
                        getUserTitle(interaction.user.id, guildId).catch(() => null)
                    ]);

                    const userIds = [...new Set([...top3Raw.map(u => u.user_id), ...listRaw.map(u => u.user_id), interaction.user.id])];
                    const [members, avatarConfigs, userTitles, levelRoles] = await Promise.all([
                        interaction.guild.members.fetch({ user: userIds }).catch(() => new Map()),
                        getBulkUserAvatarConfig(guildId, userIds).catch(() => ({})),
                        getBulkUserTitles(guildId, userIds).catch(() => ({})),
                        require('../../utils/core/database').getLevelRoles(guildId).catch(() => [])
                    ]);

                    const resolveFinalTitle = (uid, mem, rank, dbTitle) => {
                        if (dbTitle) return dbTitle;
                        if (mem) {
                            if (mem.permissions.has('Administrator') || (guildConfig.premium_role_id && mem.roles.cache.has(guildConfig.premium_role_id)) || mem.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse'].some(id => r.name.includes(id)))) return 'Seraphic Muse';
                            if (mem.premiumSinceTimestamp) return 'Server Booster';
                            
                            const userLvl = rank || 0;
                            const earned = levelRoles.filter(lr => lr.level <= userLvl);
                            if (earned.length > 0) {
                                const topRole = earned.sort((a, b) => b.level - a.level)[0];
                                const role = interaction.guild.roles.cache.get(topRole.role_id);
                                if (role) return role.name.replace(/^\d+\s*\|\s*/, '');
                            }
                        }
                        return null;
                    };

                    const anilistMap = {};
                    const anilistToFetch = [...new Set(Object.values(avatarConfigs).filter(c => c.source === 'ANILIST' && c.anilistUsername).map(c => c.anilistUsername))];
                    if (anilistToFetch.length > 0) {
                        await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                            if (data && data.avatar) anilistMap[username] = data.avatar.large;
                        }).catch(() => {})));
                    }

                    const topUsers = [...top3Raw, ...listRaw].map(raw => {
                        const member = members.get(raw.user_id);
                        return {
                            ...raw,
                            username: member ? getResolvableName(member) : 'Unknown Archivist',
                            avatarUrl: resolveAvatar(raw.user_id, member, avatarConfigs, anilistMap),
                            title: resolveFinalTitle(raw.user_id, member, null, userTitles[raw.user_id]),
                            isBooster: member ? !!member.premiumSinceTimestamp : false,
                            isPremium: member ? (
                                member.permissions.has('Administrator') || 
                                (guildConfig.premium_role_id && member.roles.cache.has(guildConfig.premium_role_id)) ||
                                member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                            ) : false
                        };
                    });

                    const maxPoints = top3Raw[0] ? parseFloat(top3Raw[0].total_points) || 1 : 1;
                    const challengerData = {
                        rank: challengerStats ? challengerStats.rank : '?',
                        level: challengerStats ? challengerStats.rank : '?', 
                        xp: challengerStats ? parseFloat(challengerStats.total_points) : 0,
                        current: challengerStats ? parseFloat(challengerStats.total_points) : 0,
                        required: maxPoints,
                        percent: Math.min(100, Math.max(0, ((challengerStats ? parseFloat(challengerStats.total_points) : 0) / maxPoints) * 100)),
                        title: resolveFinalTitle(interaction.user.id, interaction.member, null, userTitles[interaction.user.id]),
                        bannerUrl: bgUrl,
                        isBooster: interaction.member ? !!interaction.member.premiumSinceTimestamp : false,
                        isPremium: interaction.member ? (
                            interaction.member.permissions.has('Administrator') || 
                            (guildConfig.premium_role_id && interaction.member.roles.cache.has(guildConfig.premium_role_id)) ||
                            interaction.member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                        ) : false
                    };

                    const buffer = await generateMinigameLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, getResolvableName(interaction.member), resolveAvatar(interaction.user.id, interaction.member, avatarConfigs, anilistMap), page);
                    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard_arcade.webp' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_prev')
                            .setEmoji(CONFIG.EMOJIS.LEFT)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_page')
                            .setLabel(`Page ${page}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_next')
                            .setEmoji(CONFIG.EMOJIS.RIGHT)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(listRaw.length < 7)
                    );

                    const selectRow = new ActionRowBuilder().addComponents(
                        new (require('discord.js').StringSelectMenuBuilder)()
                            .setCustomId('local_leaderboard_switch')
                            .setPlaceholder('Switch Archive View...')
                            .addOptions([
                                { label: '✨ Experience Leaderboard', value: 'exp', description: 'View the High Council of Scholars.', default: type === 'exp' },
                                { label: '🎯 Arcade Leaderboard', value: 'arcade', description: 'View the Arcade Protocol champions.', default: type === 'arcade' }
                            ])
                    );

                    return { files: [attachment], components: [row, selectRow] };

                } else {
                    // --- EXP LEADERBOARD LOGIC ---
                    const listOffset = 3 + (page - 1) * 7;
                    const [top3Raw, listRaw, guildConfig, rankData, bgUrl, color, userTitle] = await Promise.all([
                        getTopUsers(guildId, 3, 0).catch(() => []),
                        getTopUsers(guildId, 7, listOffset).catch(() => []),
                        fetchConfig(guildId).catch(() => ({})),
                        getUserRank(interaction.user.id, guildId).catch(() => ({ xp: 0, level: 0, rank: '?' })),
                        getUserBannerConfig(interaction.user.id, guildId).catch(() => ({ source: 'PRESET', customUrl: null })),
                        getUserColor(interaction.user.id, guildId).catch(() => CONFIG.COLORS.PRIMARY),
                        getUserTitle(interaction.user.id, guildId).catch(() => null)
                    ]);
                    const userIds = [...new Set([...top3Raw.map(u => u.user_id), ...listRaw.map(u => u.user_id), interaction.user.id])];

                    const [members, avatarConfigs, userTitles, levelRoles] = await Promise.all([
                        interaction.guild.members.fetch({ user: userIds }).catch(() => new Map()),
                        getBulkUserAvatarConfig(guildId, userIds).catch(() => ({})),
                        getBulkUserTitles(guildId, userIds).catch(() => ({})),
                        require('../../utils/core/database').getLevelRoles(guildId).catch(() => [])
                    ]);

                    const resolveFinalTitle = (uid, mem, rank, dbTitle) => {
                        if (dbTitle) return dbTitle;
                        if (mem) {
                            if (mem.permissions.has('Administrator') || (guildConfig.premium_role_id && mem.roles.cache.has(guildConfig.premium_role_id)) || mem.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse'].some(id => r.name.includes(id)))) return 'Seraphic Muse';
                            if (mem.premiumSinceTimestamp) return 'Server Booster';
                            
                            const userLvl = rank || 0;
                            const earned = levelRoles.filter(lr => lr.level <= userLvl);
                            if (earned.length > 0) {
                                const topRole = earned.sort((a, b) => b.level - a.level)[0];
                                const role = interaction.guild.roles.cache.get(topRole.role_id);
                                if (role) return role.name.replace(/^\d+\s*\|\s*/, '');
                            }
                        }
                        return null;
                    };

                    const anilistMap = {};
                    const anilistToFetch = [...new Set(Object.values(avatarConfigs).filter(c => c.source === 'ANILIST' && c.anilistUsername).map(c => c.anilistUsername))];
                    if (anilistToFetch.length > 0) {
                        await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                            if (data && data.avatar) anilistMap[username] = data.avatar.large;
                        }).catch(() => {})));
                    }

                    const topUsers = [...top3Raw, ...listRaw].map(raw => {
                        const member = members.get(raw.user_id);
                        return {
                            ...raw,
                            username: member ? getResolvableName(member) : 'Unknown User',
                            avatarUrl: resolveAvatar(raw.user_id, member, avatarConfigs, anilistMap),
                            title: resolveFinalTitle(raw.user_id, member, parseInt(raw.level), userTitles[raw.user_id]),
                            isBooster: member ? !!member.premiumSinceTimestamp : false,
                            isPremium: member ? (
                                member.permissions.has('Administrator') || 
                                (guildConfig.premium_role_id && member.roles.cache.has(guildConfig.premium_role_id)) ||
                                member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                            ) : false
                        };
                    });

                    const progress = getLevelProgress(rankData ? parseInt(rankData.xp) : 0, rankData ? parseInt(rankData.level) : 0);
                    const challengerData = {
                        rank: rankData ? rankData.rank : '?',
                        level: rankData ? parseInt(rankData.level) : 0,
                        xp: rankData ? parseInt(rankData.xp) : 0,
                        current: progress.current, required: progress.required,
                        percent: progress.percent, 
                        title: resolveFinalTitle(interaction.user.id, interaction.member, parseInt(rankData?.level || 0), userTitles[interaction.user.id]),
                        isBooster: interaction.member ? !!interaction.member.premiumSinceTimestamp : false,
                        isPremium: interaction.member ? (
                            interaction.member.permissions.has('Administrator') || 
                            (guildConfig.premium_role_id && interaction.member.roles.cache.has(guildConfig.premium_role_id)) ||
                            interaction.member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse', 'premium'].some(id => r.name.toLowerCase().includes(id.toLowerCase())))
                        ) : false
                    };

                    const buffer = await generateLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, getResolvableName(interaction.member), resolveAvatar(interaction.user.id, interaction.member, avatarConfigs, anilistMap), page);
                    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.webp' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_prev')
                            .setEmoji(CONFIG.EMOJIS.LEFT)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_page')
                            .setLabel(`Page ${page}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('local_leaderboard_next')
                            .setEmoji(CONFIG.EMOJIS.RIGHT)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(listRaw.length < 7)
                    );

                    const selectRow = new ActionRowBuilder().addComponents(
                        new (require('discord.js').StringSelectMenuBuilder)()
                            .setCustomId('local_leaderboard_switch')
                            .setPlaceholder('Switch Archive View...')
                            .addOptions([
                                { label: '✨ Experience Leaderboard', value: 'exp', description: 'View the High Council of Scholars.', default: type === 'exp' },
                                { label: '🎯 Arcade Leaderboard', value: 'arcade', description: 'View the Arcade Protocol champions.', default: type === 'arcade' }
                            ])
                    );

                    return { files: [attachment], components: [row, selectRow] };
                }
            } catch (err) {
                logger.error('[Leaderboard] Update failed:', err);
                return { content: `❌ **Archival Error**: The library is currently inaccessible. (\`${err.message}\`)`, files: [], components: [] };
            }
        };

        const initialPayload = await updateMessage(currentPage);
        const message = await loader.stop(initialPayload);

        if (!message) return;

        const collector = message.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id,
            time: 300000 
        });

        collector.on('collect', async i => {
            try {
                if (i.customId === 'local_leaderboard_prev' || i.customId === 'local_leaderboard_next' || i.customId === 'local_leaderboard_switch') {
                    await i.deferUpdate();
                }

                if (i.customId === 'local_leaderboard_prev') currentPage--;
                else if (i.customId === 'local_leaderboard_next') currentPage++;
                else if (i.customId === 'local_leaderboard_switch') {
                    type = i.values[0];
                    currentPage = 1;
                }
                else return;
                const newPayload = await updateMessage(currentPage);
                await i.editReply(newPayload);
            } catch (err) {
                logger.error('[Leaderboard] Collector error:', err);
                await i.followUp({ content: '🏮 The archives shifted unexpectedly. Please try again.', ephemeral: true }).catch(() => {});
            }
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('local_leaderboard_prev').setEmoji(CONFIG.EMOJIS.LEFT).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('local_leaderboard_page').setLabel(`Page ${currentPage}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('local_leaderboard_next').setEmoji(CONFIG.EMOJIS.RIGHT).setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
