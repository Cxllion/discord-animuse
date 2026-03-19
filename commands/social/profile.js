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
const { getDynamicUserTitle } = require('../../utils/core/userMeta');

module.exports = {
    cooldown: 10, // Canvas generation
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Inspect a Patron\'s Identity Card within the Library.')
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

        // Calculate Muse Rank (Dynamic based on bound level roles)
        const { getLevelRoles } = require('../../utils/core/database');
        const levelRoles = await getLevelRoles(guildId);
        
        // Find highest earned role
        const earnedRoles = levelRoles.filter(lr => lr.level <= level);
        let knowledgeRank = 'Patron'; // Default
        
        if (earnedRoles.length > 0) {
            const highestRole = earnedRoles[earnedRoles.length - 1];
            const roleObj = interaction.guild.roles.cache.get(highestRole.role_id);
            let name = roleObj ? roleObj.name : `Level ${highestRole.level} Muse`;
            // Remove number prefix (e.g., "10 | Scribe Muse" -> "Scribe Muse")
            knowledgeRank = name.replace(/^\d+\s*\|\s*/, '');
        }

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

        const titleVal = await getDynamicUserTitle(member);
        const userData = {
            xp,
            level,
            rank: rankData ? rankData.rank : '?',
            current: progress.current,
            required: progress.required,
            percent: progress.percent,
            title: (title && !title.includes('Muse Reader') && !title.includes('Muse Manager')) ? title : `Muse ${titleVal}`,
            joinedDate,
            messages,
            knowledgeRank,
            anilist_synced: !!linkedUsername,
            anilist: anilistStats,
            avatarConfig: avatarConfig,
            guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : targetUser.displayAvatarURL({ extension: 'png' })
        };

        // Generate Image
        const displayName = member ? member.displayName : targetUser.username;

        // Provide immediate feedback with a beautiful animated progress bar
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        loader.startProgress('Materializing Profile...', 6); // No await: allow Canvas to start immediately

        const buffer = await generateProfileCard(targetUser, userData, favorites, backgroundUrl, color, displayName);
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.png' });

        // Interactive Button
        const dashboardBtn = new ButtonBuilder()
            .setCustomId('dashboard_open')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(dashboardBtn);

        // MERGED DELIVERY: 100% + Card in one call
        const response = await loader.stop({ files: [attachment], components: [row] });

        // Button Collector
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'dashboard_open') {
                if (i.user.id === targetUser.id) {
                    const { showProfileDashboard } = require('../../utils/handlers/profileHandlers');
                    await showProfileDashboard(i);
                } else {
                    await i.reply({
                        content: `**${targetUser.username}'s Identity File**\nLibrary records indicate this patron has been registered since ${joinedDate}.\n*Detailed usage stats are currently classified.*`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });
    },
};
