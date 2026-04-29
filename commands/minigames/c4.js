const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const connect4 = require('./connect4');

/**
 * C4 Alias: Minimal wrapper for /connect4
 */
module.exports = {
    ...connect4,
    data: new SlashCommandBuilder()
        .setName('c4')
        .setDescription('Initialize a Tactical Link (Connect 4) challenge against another patron.')
        .addUserOption(option => 
            option.setName('opponent')
            .setDescription('The patron to challenge')
            .setRequired(true)
        ),
};
