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
                    { name: '🎯 Minigames', value: 'minigames' }
                )),
    execute: leaderboardCommand.execute
};
