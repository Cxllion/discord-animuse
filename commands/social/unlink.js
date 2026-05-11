const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { unlinkAnilistAccount, getLinkedAnilist } = require('../../utils/core/database');
const logger = require('../../utils/core/logger');

module.exports = {
    category: 'social',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your AniList account from your Discord profile.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Check if linked first? Not strictly necessary but nice UX.
        const currentLink = await getLinkedAnilist(interaction.user.id, interaction.guild.id);

        const CONFIG = require('../../utils/config');
        if (!currentLink) {
            const embed = baseEmbed()
                .setTitle('Not Linked')
                .setDescription('You do not have an AniList account linked to your profile.')
                .setColor(CONFIG.COLORS.INFO);
            return await interaction.editReply({ embeds: [embed] });
        }

        const { error } = await unlinkAnilistAccount(interaction.user.id, interaction.guild.id);

        if (error) {
            logger.error('Unlink Error:', error, 'UnlinkCommand');
            const embed = baseEmbed()
                .setDescription('An error occurred while attempting to sever the spiritual link. The bond remains.')
                .setColor(CONFIG.COLORS.ERROR);
            return await interaction.editReply({ embeds: [embed] });
        }

        const embed = baseEmbed()
            .setTitle('Link Severed')
            .setDescription(`The spiritual connection to **${currentLink}** has been dissolved. Your library card is now autonomous.`)
            .setColor(CONFIG.COLORS.SUCCESS);

        await interaction.editReply({ embeds: [embed] });
    },
};
