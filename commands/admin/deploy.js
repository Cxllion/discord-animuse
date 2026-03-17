const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeColorDeployment } = require('../../utils/handlers/roleDashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploy')
        .setDescription('Mass-deploy server configuration assets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub => 
            sub.setName('basic')
               .setDescription('Deploy the 10 basic color roles (White, Black, etc.).')
        )
        .addSubcommand(sub => 
            sub.setName('premium')
               .setDescription('Deploy the 90 premium color shades organizzad by families.')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        
        if (sub === 'basic') {
            return await executeColorDeployment(interaction, 'basic');
        }

        if (sub === 'premium') {
            return await executeColorDeployment(interaction, 'premium');
        }
    }
};
