const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Displays the guild\'s registration card.'),

    async execute(interaction) {
        try {
            const guild = interaction.guild;
            const owner = await guild.fetchOwner();

            // Counts
            const totalMembers = guild.memberCount;
            const botCount = guild.members.cache.filter(m => m.user.bot).size;
            const humanCount = totalMembers - botCount;

            const channels = guild.channels.cache;
            const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
            const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;

            const roles = guild.roles.cache.size;
            const emojis = guild.emojis.cache.size;
            const stickers = guild.stickers.cache.size;

            // Dates
            const createdDate = moment(guild.createdAt).format('MMMM Do YYYY, h:mm a');
            const createdAgo = moment(guild.createdAt).fromNow();

            const embed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.PRIMARY)
                .setTitle(`${guild.name} Archive Data`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
                .setImage(guild.bannerURL({ size: 1024 }))
                .addFields(
                    {
                        name: '📜 General',
                        value: `**Owner:** ${owner.user.tag}\n**Created:** ${createdDate}\n(${createdAgo})`,
                        inline: false
                    },
                    {
                        name: '👥 Population',
                        value: `**Total:** ${totalMembers}\n**Humans:** ${humanCount}\n**Bots:** ${botCount}`,
                        inline: true
                    },
                    {
                        name: '💬 Channels',
                        value: `**Text:** ${textChannels}\n**Voice:** ${voiceChannels}\n**Categories:** ${categories}`,
                        inline: true
                    },
                    {
                        name: '🎨 Assets',
                        value: `**Roles:** ${roles}\n**Emojis:** ${emojis}\n**Stickers:** ${stickers}`,
                        inline: true
                    },
                    {
                        name: '💎 Boost Status',
                        value: `**Level:** ${guild.premiumTier}\n**Boosts:** ${guild.premiumSubscriptionCount}`,
                        inline: true
                    }
                )
                .setFooter({ text: `ID: ${guild.id} | Animuse System`, iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
