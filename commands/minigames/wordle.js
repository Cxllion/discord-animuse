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
        // Initial reply is public (Patron's Private Board)
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            const user = {
                username: interaction.user.username,
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
                // Gentle Nudge for Admins
                await interaction.followUp({
                    content: `⚠️ **Admin Bypass Active**: Initializing terminal outside of the designated Arcade wing. It is recommended to use <#${config.arcade_channel_id}> for public synchronization. ♡`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // 1. Check if already played today (Finished Game)
            const hasPlayed = await minigameService.hasPlayedToday(userId);
            if (hasPlayed) {
                const session = await wordleService.startNewGame(userId).catch(() => null);
                
                // If they have played, session will throw or we can fetch history
                const history = await minigameService.getWordleSession(userId) || await minigameService.getWordleHistory(userId);
                
                if (history) {
                    const bufferPersonal = await wordleGenerator.generateBoard(history, { anonymize: false, user: user });
                    const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-result.png' });
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
                    );

                    return await interaction.editReply({
                        content: `🏁 **Archive Synchronized.** You have already identified the key **${history.targetWord}** for this cycle. ♡`,
                        files: [attachmentPersonal],
                        components: [row]
                    });
                }
            }
            
            // 2. Initialize Game State (Individual)
            const gameState = await wordleService.startNewGame(userId);
            
            // 3. Generate Anonymized Board Card (Public)
            const bufferAnon = await wordleGenerator.generateBoard(gameState, { 
                anonymize: true,
                user: user
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
                    .setEmoji('🏳️'),
                new ButtonBuilder()
                    .setCustomId(`wordle_progress_${userId}`)
                    .setLabel('View Progress')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔍')
            );

            // Respond with the Image Card
            const publicMsg = await interaction.editReply({
                files: [attachmentAnon],
                components: [row]
            });

            // Store IDs for future background updates
            gameState.publicMessageId = publicMsg.id;
            gameState.publicChannelId = publicMsg.channelId;

            // 4. Send Personal Console (Private) - ONLY if they have already started guessing
            if (gameState.guesses.length > 0) {
                const bufferPersonal = await wordleGenerator.generateBoard(gameState, { anonymize: false, user: user });
                const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-personal.png' });
                
                const privateRow = new ActionRowBuilder().addComponents(
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
                );

                await interaction.followUp({
                    files: [attachmentPersonal],
                    components: [privateRow],
                    flags: [MessageFlags.Ephemeral]
                });
            }

        } catch (error) {
            logger.error('[Wordle] Command Execution Failed:', error);
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }
};
