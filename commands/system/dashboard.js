const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { displayRoleDashboard } = require('../../utils/handlers/roleDashboard');

module.exports = {
    category: 'system',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Open the interactive role management hub.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    dbRequired: true,
    async execute(interaction) {
        return await displayRoleDashboard(interaction);
    }
};
