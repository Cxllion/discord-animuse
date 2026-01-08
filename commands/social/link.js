const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { getAnilistUser } = require('../../utils/services/anilistService');
const { linkAnilistAccount } = require('../../utils/core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Discord account to your AniList profile.')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your AniList username')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('username');

        // 1. Verify User exists on AniList
        const anilistUser = await getAnilistUser(username);

        if (!anilistUser) {
            const embed = baseEmbed()
                .setTitle('User Not Found')
                .setDescription(`I could not locate a file under the name "**${username}**" in the external AniList Archives. Please verify the spelling on your card.`)
                .setFooter({ text: 'Archive Query • Powered by AniList' })
                .setColor('#FF0000');
            return await interaction.editReply({ embeds: [embed] });
        }

        // 2. Link in Database
        const { error } = await linkAnilistAccount(interaction.user.id, interaction.guild.id, anilistUser.name);

        if (error) {
            console.error('Link Error:', error);
            const embed = baseEmbed()
                .setDescription('The archives are currently in disarray. I successfully initiated the link, but the ink smudged. Please try again.')
                .setColor('#FF0000');
            return await interaction.editReply({ embeds: [embed] });
        }

        // 3. Success Response
        const embed = baseEmbed()
            .setTitle('Spiritual Link Established')
            .setDescription(`Your local identity has been successfully bound to the AniList Archives of **${anilistUser.name}**.\n\n${anilistUser.siteUrl}`)
            .setThumbnail(anilistUser.avatar.large)
            .setFooter({ text: 'Archive Integration • Powered by AniList' });

        await interaction.editReply({ embeds: [embed] });
    },
};

