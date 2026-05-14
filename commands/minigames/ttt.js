const tictactoeCommand = require('./tictactoe');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    ...tictactoeCommand,
    data: new SlashCommandBuilder()
        .setName('ttt')
        .setDescription('Initialize a Tactical Link (Tic Tac Toe) challenge against another patron.')
        .addUserOption(option => 
            option.setName('opponent')
            .setDescription('The patron to challenge')
            .setRequired(true)
        ),
};
