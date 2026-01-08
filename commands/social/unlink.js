const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { unlinkAnilistAccount, getLinkedAnilist } = require('../../utils/core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your AniList account from your Discord profile.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Check if linked first? Not strictly necessary but nice UX.
        const currentLink = await getLinkedAnilist(interaction.user.id, interaction.guild.id);

        if (!currentLink) {
            const embed = baseEmbed()
                .setTitle('Not Linked')
                .setDescription('You do not have an AniList account linked to your profile.')
                .setColor('#FFACD1');
            return await interaction.editReply({ embeds: [embed] });
        }

        const { error } = await unlinkAnilistAccount(interaction.user.id, interaction.guild.id);

        if (error) {
            console.error('Unlink Error:', error);
            const embed = baseEmbed()
                .setDescription('An error occurred while attempting to sever the spiritual link. The bond remains.')
                .setColor('#FF0000');
            return await interaction.editReply({ embeds: [embed] });
        }

        const embed = baseEmbed()
            .setTitle('Link Severed')
            .setDescription(`The spiritual connection to **${currentLink}** has been dissolved. Your library card is now autonomous.`)
            .setColor('#FFACD1');

        await interaction.editReply({ embeds: [embed] });
    },
};
