const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const connect4Service = require('../../utils/services/connect4Service');
const connect4Generator = require('../../utils/generators/connect4Generator');
const { fetchConfig } = require('../../utils/core/database');
const logger = require('../../utils/core/logger');

// Simple in-memory cooldown to prevent challenge spam
const challengeCooldowns = new Set();

/**
 * Connect4 Command: Tactical Link initialization.
 */
module.exports = {
    category: 'minigames',
    dbRequired: true,
    cooldown: 15,
    data: new SlashCommandBuilder()
        .setName('connect4')
        .setDescription('Initialize a Tactical Link (Connect 4) challenge against another patron.')
        .addUserOption(option => 
            option.setName('opponent')
            .setDescription('The patron to challenge')
            .setRequired(true)
        ),
    
    async execute(interaction) {
        const challengerId = interaction.user.id;
        const opponent = interaction.options.getUser('opponent');

        if (challengeCooldowns.has(challengerId)) {
            return await interaction.reply({ content: '⏳ **Protocol Throttling:** Please wait for the terminal to cool down before initializing another Tactical Link.', flags: [MessageFlags.Ephemeral] });
        }
        
        challengeCooldowns.add(challengerId);
        setTimeout(() => challengeCooldowns.delete(challengerId), 15000);

        try {
            const isAdmin = interaction.member?.permissions.has('Administrator');
            const isSelfBotChallenge = opponent.id === interaction.client.user.id && isAdmin;

            // 1. Validation Checks
            if (opponent.bot && !isSelfBotChallenge) {
                return await interaction.reply({ 
                    content: '🤖 **Protocol Error:** Automated entities cannot participate in the Tactical Link.', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            if (opponent.id === challengerId && !isSelfBotChallenge) {
                return await interaction.reply({ 
                    content: '❌ **Protocol Deviation:** You cannot establish a Tactical Link with your own profile.', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            // 2. Arcade Protocol: Channel Verification
            const config = await fetchConfig(interaction.guildId);
            const isArcadeChannel = config?.arcade_channel_id && interaction.channelId === config.arcade_channel_id;

            if (config?.arcade_channel_id && !isArcadeChannel) {
                if (!isAdmin) {
                    return await interaction.reply({
                        content: `❌ **Arcade Protocol Deviation**: The Tactical Link terminal can only be initialized in the designated Arcade wing: <#${config.arcade_channel_id}>.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                // Admin bypass nudge
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                await interaction.editReply({
                    content: `⚠️ **Admin Bypass Active**: Initializing terminal outside of the designated Arcade wing. It is recommended to use <#${config.arcade_channel_id}>. ♡`
                });
            } else {
                await interaction.deferReply();
            }

            // 2.5 Permission Guard
            const requiredPerms = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles];
            if (interaction.guild && !interaction.appPermissions?.has(requiredPerms)) {
                return await (interaction.deferred ? interaction.editReply : interaction.reply)({
                    content: '🚫 **Arcade Protocol Error:** I lack the necessary permissions (`Send Messages`, `Attach Files`) to initialize the Tactical Link in this sector.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // 3. Arcade Protocol: Invitation Phase
            const invitationRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`c4_accept_${challengerId}_${opponent.id}`).setLabel('Accept Link').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId(`c4_decline_${challengerId}_${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
            );

            const inviteHeader = `🎮 **Connect Muse Challenge:** <@${challengerId}> has challenged <@${opponent.id}> to a match!`;
            
            if (interaction.deferred) {
                await interaction.editReply({
                    content: inviteHeader,
                    components: [invitationRow]
                });
            } else {
                await interaction.reply({
                    content: inviteHeader,
                    components: [invitationRow]
                });
            }

        } catch (error) {
            logger.error('[Connect4] Command Execution Failed:', error);
            const response = { 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: [MessageFlags.Ephemeral] 
            };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(response);
            } else {
                await interaction.reply(response);
            }
        }
    }
};
