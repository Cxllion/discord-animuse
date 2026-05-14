const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { fetchConfig } = require('../../utils/core/database');
const logger = require('../../utils/core/logger');

const challengeCooldowns = new Set();

module.exports = {
    category: 'minigames',
    dbRequired: true,
    cooldown: 15,
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Initialize a Tactical Link (Tic Tac Toe) challenge against another patron.')
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

            const config = await fetchConfig(interaction.guildId);
            const isArcadeChannel = config?.arcade_channel_id && interaction.channelId === config.arcade_channel_id;

            if (config?.arcade_channel_id && !isArcadeChannel) {
                if (!isAdmin) {
                    return await interaction.reply({
                        content: `❌ **Arcade Protocol Deviation**: The Tactical Link terminal can only be initialized in the designated Arcade wing: <#${config.arcade_channel_id}>.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                await interaction.editReply({
                    content: `⚠️ **Admin Bypass Active**: Initializing terminal outside of the designated Arcade wing. It is recommended to use <#${config.arcade_channel_id}>. ♡`
                });
            } else {
                await interaction.deferReply();
            }

            const requiredPerms = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles];
            if (interaction.guild && !interaction.appPermissions?.has(requiredPerms)) {
                return await (interaction.deferred ? interaction.editReply : interaction.reply)({
                    content: '🚫 **Arcade Protocol Error:** I lack the necessary permissions (`Send Messages`, `Attach Files`) to initialize the Tactical Link in this sector.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_accept_${challengerId}_${opponent.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`${prefix}_decline_${challengerId}_${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
            );

            const inviteEmbed = new EmbedBuilder()
                .setTitle('🌸 TACTICAL LINK: INVITATION RECEIVED')
                .setDescription(`The patron <@${challengerId}> is requesting to establish a **Tic Tac Toe** sequence with <@${opponent.id}>.\n\n**Protocol Details:**\n• Turn Limit: 2 Minutes\n• Victory Prize: 1 Arcade Point\n• Board State: Initialized`)
                .setColor(0xFFB7C5)
                .setFooter({ text: 'Awaiting biometric authorization...' });

            const msgOptions = {
                content: `👋 <@${opponent.id}>, a new link request has arrived.`,
                embeds: [inviteEmbed],
                components: [row]
            };

            if (interaction.deferred) {
                await interaction.editReply(msgOptions);
            } else {
                await interaction.reply(msgOptions);
            }

        } catch (error) {
            logger.error('[TicTacToe] Command Execution Failed:', error);
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
