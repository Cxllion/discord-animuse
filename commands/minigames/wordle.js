const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wordleService = require('../../utils/services/wordleService');
const wordleGenerator = require('../../utils/generators/wordleGenerator');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { fetchConfig } = require('../../utils/core/database');
const minigameService = require('../../utils/services/minigameService');
const logger = require('../../utils/core/logger');

/**
 * Wordle Command: Entry point for the Daily Wordle challenge.
 */
module.exports = {
    category: 'minigames',
    dbRequired: true,
    cooldown: 15, 
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription('Initialize the Daily Wordle decoding protocol.'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        
        try {
            // Check play status BEFORE deferring to set correct ephemeral flag
            const hasPlayed = await minigameService.hasPlayedToday(userId);
            
            if (hasPlayed) {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const history = await minigameService.getWordleHistory(userId);
                
                if (history) {
                    const user = {
                        username: interaction.user.username,
                        displayName: interaction.member?.displayName || interaction.user.username,
                        avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
                    };
                    const bufferPersonal = await wordleGenerator.generateBoard(history, { anonymize: false, user: user });
                    const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-result.png' });
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
                    );

                    return await interaction.editReply({
                        content: `🏁 **Protocol Completed.** You have already finished your attempt for this solar cycle.`,
                        files: [attachmentPersonal],
                        components: [row]
                    });
                } else {
                    return await interaction.editReply('You have completed today\'s protocol, but your record is syncing. Please try again in a moment. ♡');
                }
            }
            
            // If they haven't played, we do a public defer for the public board
            await interaction.deferReply();

            const user = {
                username: interaction.user.username,
                displayName: interaction.member?.displayName || interaction.user.username,
                avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
            };

            // 0. Arcade Protocol: Channel Verification
            const config = await fetchConfig(interaction.guildId);
            const isAdmin = interaction.member?.permissions.has('Administrator');
            const isArcadeChannel = config?.arcade_channel_id && interaction.channelId === config.arcade_channel_id;

            if (config?.arcade_channel_id && !isArcadeChannel) {
                if (!isAdmin) {
                    return await interaction.editReply({
                        content: `❌ **Arcade Protocol Deviation**: The Daily Wordle terminal can only be initialized in the designated Arcade wing: <#${config.arcade_channel_id}>.`
                    });
                }
                // Gentle Nudge for Admins (Note: followUp since we deferred publicly, though they can see it)
                await interaction.followUp({
                    content: `⚠️ **Admin Bypass Active**: Initializing terminal outside of the designated Arcade wing. It is recommended to use <#${config.arcade_channel_id}> for public synchronization. ♡`,
                    flags: [MessageFlags.Ephemeral]
                });
            }
            
            // 2. Initialize Game State (Individual)
            const gameState = await wordleService.startNewGame(userId);
            
            // 3. Generate Anonymized Board Card (Public)
            // Fetch minigrid cache so the very first public board has rings of others
            const others = await wordleService.getRecentGames(userId, 5);
            const otherGames = await Promise.all(others.map(async (g) => {
                try {
                    let u = interaction.client.users.cache.get(g.userId);
                    if (!u) u = await interaction.client.users.fetch(g.userId).catch(() => null);
                    let dName = u?.username || 'Patron';
                    if (interaction.guild && u) {
                        const member = await interaction.guild.members.fetch(u.id).catch(() => null);
                        if (member) dName = member.displayName;
                    }
                    return { 
                        ...g, 
                        user: { 
                            username: u?.username || 'Patron',
                            displayName: dName,
                            avatarURL: u?.displayAvatarURL({ extension: 'png', size: 64 }) || null 
                        } 
                    };
                } catch (e) {
                    return { ...g, user: { username: 'Patron', displayName: 'Patron', avatarURL: null } };
                }
            }));
            
            const bufferAnon = await wordleGenerator.generateBoard(gameState, { 
                anonymize: true,
                user: user,
                otherGames: otherGames
            });
            const attachmentAnon = new AttachmentBuilder(bufferAnon, { name: 'wordle-archival.png' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wordle_guess_${userId}`)
                    .setLabel('Submit Guess')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⌨️'),
                new ButtonBuilder()
                    .setCustomId(`wordle_forfeit_${userId}`)
                    .setLabel('Forfeit')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🏳️')
            ); // Removed "View Progress" button, it causes confusion in V2

            // Respond with the Image Card
            const publicMsg = await interaction.editReply({
                files: [attachmentAnon],
                components: [row]
            });

            // Store IDs for future background updates
            gameState.publicMessageId = publicMsg.id;
            gameState.publicChannelId = publicMsg.channelId;
            await minigameService.saveWordleSession(userId, gameState);

        } catch (error) {
            logger.error('[Wordle] Command Execution Failed:', error);
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }
};
