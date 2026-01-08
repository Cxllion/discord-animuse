const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } = require('discord.js');
const { getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { extractAnilistId, getLinkedAnilist, getAniListProfile } = require('../../utils/services/anilistService');
const {
    getLinkedAnilist: retrieveLinkedUser,
    getUserBackground: retrieveBackground,
    getUserTitle: retrieveTitle,
    getUserColor: retrieveColor,
    getUserAvatarConfig: retrieveAvatarConfig,
    updateUserColor
} = require('../../utils/core/database');
const { generateProfileCard } = require('../../utils/generators/profileGenerator');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Inspect a Patron\'s Identity Card within the Archives.')
        .addUserOption(option => option.setName('user').setDescription('The Patron to investigate')),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;

        // OFFLINE MODE CHECK
        if (interaction.client.isOfflineMode) {
            return await interaction.followUp({
                content: '⚠️ **The Archives are currently sealed.** (Database Offline)\nProfiles cannot be generated at this time. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Fetch Member & Data
        let member;
        try {
            member = await interaction.guild.members.fetch(targetUser.id);
        } catch (e) {
            member = null;
        }

        const [rankData, linkedUsername, backgroundUrl, title, color, avatarConfig] = await Promise.all([
            getUserRank(targetUser.id, guildId),
            retrieveLinkedUser(targetUser.id, guildId),
            retrieveBackground(targetUser.id, guildId),
            retrieveTitle(targetUser.id, guildId),
            retrieveColor(targetUser.id, guildId),
            retrieveAvatarConfig(targetUser.id, guildId)
        ]);

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        // Calculate Ranks & Stats
        let knowledgeRank = 'Novice';
        if (level >= 5) knowledgeRank = 'Apprentice';
        if (level >= 10) knowledgeRank = 'Scholar';
        if (level >= 20) knowledgeRank = 'Sage';
        if (level >= 30) knowledgeRank = 'Archivist';
        if (level >= 50) knowledgeRank = 'Muse';

        const joinedDate = member ? member.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
        const messages = Math.floor(xp / 20);

        // Fetch AniList Data
        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let favorites = [];

        if (linkedUsername) {
            const { stats, favorites: favs, avatar } = await getAniListProfile(linkedUsername);
            if (stats) anilistStats = stats;
            if (favs) favorites = favs;
            // Inject AniList avatar into config if needed
            if (avatarConfig && avatarConfig.source === 'ANILIST') {
                avatarConfig.anilistAvatar = avatar;
            }
        }

        const userData = {
            xp,
            level,
            rank: rankData ? rankData.rank : '?',
            current: progress.current,
            required: progress.required,
            percent: progress.percent,
            title: (title && title !== 'Muse Reader') ? title : 'Muse Reader',
            joinedDate,
            messages,
            knowledgeRank,
            anilist_synced: !!linkedUsername,
            anilist_synced: !!linkedUsername,
            anilist: anilistStats,
            avatarConfig: avatarConfig,
            guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : targetUser.displayAvatarURL({ extension: 'png' })
        };

        // Generate Image
        const displayName = member ? member.displayName : targetUser.username;

        // Provide immediate feedback before the heavy image generation
        await interaction.editReply({ content: `🔍 Found **${displayName}**. Materializing profile...` });

        const buffer = await generateProfileCard(targetUser, userData, favorites, backgroundUrl, color, displayName);
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.png' });

        // Interactive Button
        const dashboardBtn = new ButtonBuilder()
            .setCustomId('dashboard_open')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(dashboardBtn);

        const response = await interaction.editReply({ content: '', files: [attachment], components: [row] });

        // Button Collector
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'dashboard_open') {
                if (i.user.id === targetUser.id) {
                    const { showProfileDashboard } = require('../../utils/handlers/profileHandlers');
                    await showProfileDashboard(i);
                } else {
                    await i.reply({
                        content: `**${targetUser.username}'s Archive File**\nLibrary records indicate this patron has been registered since ${joinedDate}.\n*Detailed usage stats are currently classified.*`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });
    },
};
