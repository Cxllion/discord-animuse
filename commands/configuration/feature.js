const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags } = require('discord.js');
const { fetchConfig } = require('../../utils/core/database');
const { generateWelcomeCard } = require('../../utils/generators/welcomeGenerator');
const { generateBingoCard } = require('../../utils/generators/bingoGenerator');
const { getMediaById, getTrendingAnime, getAniListProfile } = require('../../utils/services/anilistService');
const { sendNotifications } = require('../../utils/services/scheduler');
const { getUserColor, getUserAvatarConfig, getLinkedAnilist } = require('../../utils/core/database');

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
                            { name: '🎯 Bingo', value: 'bingo' }
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
                    const attachment = new AttachmentBuilder(buffer, { name: 'welcome-test.png' });

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
                    const episode = {
                        episode: nextEpNum,
                        airingAt: Math.floor(Date.now() / 1000),
                        timeUntilAiring: 0
                    };

                    await interaction.editReply({ content: `✅ **Record Retrieved**: **${media.title.english || media.title.romaji}**\nInitiating notification simulation...` });

                    try {
                        const config = await fetchConfig(interaction.guild.id);
                        if (!config || !config.airing_channel_id) {
                            return await interaction.editReply({ content: '⚠️ **Configuration Warning**: Airing Channel is NOT set. The simulation runs, but no message will appear.\nUse `/channel assign type:airing` to set it.' });
                        }

                        await sendNotifications(interaction.client, media, episode, { forceGuildId: interaction.guild.id });
                        await interaction.followUp({ content: '✅ **Simulation Triggered**\nCheck your configured Airing Channel.', flags: MessageFlags.Ephemeral });
                    } catch (e) {
                        console.error(e);
                        await interaction.followUp({ content: '❌ Error during trigger execution.', flags: MessageFlags.Ephemeral });
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
                            const attachment = new AttachmentBuilder(buffer, { name: `bingo-${size}x${size}.png` });

                            await interaction.followUp({
                                content: `✅ **Generated ${size}x${size} Layout**`,
                                files: [attachment]
                            });

                        } catch (e) {
                            console.error(`Failed to generate ${size}x${size}:`, e);
                            await interaction.followUp({ content: `❌ Failed to generate ${size}x${size}: ${e.message}` });
                        }

                    }
                    await interaction.followUp({ content: '🏁 **Bingo Test Sequence Complete**' });
                }

            } catch (error) {
                console.error('[Command Error] /feature test', error);
                await interaction.editReply({ content: '❌ An internal error occurred while running the diagnostic.' });
            }
        }
    },
};
