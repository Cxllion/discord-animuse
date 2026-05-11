const { SlashCommandBuilder } = require('discord.js');
const leaderboardCommand = require('./leaderboard');

module.exports = {
    category: leaderboardCommand.category,
    dbRequired: leaderboardCommand.dbRequired,
    data: new SlashCommandBuilder()
        .setName('lb')
        .setDescription('Alias for /leaderboard.')
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
    execute: leaderboardCommand.execute
};
