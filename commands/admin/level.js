const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { adjustXp, setLevel, resetUserLevel, getUserRank } = require('../../utils/services/leveling');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

module.exports = {
    category: 'admin',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Manage user leveling and XP records.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName('adjust')
            .setDescription('Add or remove XP from a user.')
            .addUserOption(opt => opt.setName('user').setDescription('The user to adjust').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP to add (use negative for subtraction)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Set a user to a specific level.')
            .addUserOption(opt => opt.setName('user').setDescription('The user to set').setRequired(true))
            .addIntegerOption(opt => opt.setName('level').setDescription('The level to set them to').setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Reset a user\'s leveling progress.')
            .addUserOption(opt => opt.setName('user').setDescription('The user to reset').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('View detailed leveling info for a user.')
            .addUserOption(opt => opt.setName('user').setDescription('The user to check').setRequired(false))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetMember = interaction.options.getMember('user') || (targetUser.id === interaction.user.id ? interaction.member : null);
        const guildId = interaction.guild.id;

        await interaction.deferReply();

        if (sub === 'adjust') {
            const amount = interaction.options.getInteger('amount');
            const result = await adjustXp(targetUser.id, guildId, amount, targetMember);
            
            if (!result) return interaction.editReply({ content: '❌ Failed to update the database.' });

            const embed = baseEmbed('XP Adjustment', `Successfully adjusted XP for **${targetUser.username}**.`)
                .addFields(
                    { name: 'Change', value: `${amount > 0 ? '+' : ''}${amount} XP`, inline: true },
                    { name: 'New Total', value: `${result.xp} XP`, inline: true },
                    { name: 'New Level', value: `Level ${result.level}`, inline: true }
                )
                .setColor(CONFIG.COLORS.SUCCESS);

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'set') {
            const level = interaction.options.getInteger('level');
            const result = await setLevel(targetUser.id, guildId, level, targetMember);

            if (!result) return interaction.editReply({ content: '❌ Failed to update the database.' });

            const embed = baseEmbed('Level Set', `Successfully set **${targetUser.username}** to Level ${level}.`)
                .addFields(
                    { name: 'New Level', value: `Level ${level}`, inline: true },
                    { name: 'New XP', value: `${result.xp} XP`, inline: true }
                )
                .setColor(CONFIG.COLORS.INFO);

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'reset') {
            const result = await resetUserLevel(targetUser.id, guildId, targetMember);

            if (!result) return interaction.editReply({ content: '❌ Failed to update the database.' });

            const embed = baseEmbed('Level Reset', `Successfully reset all leveling progress for **${targetUser.username}**.`)
                .setDescription('All XP has been wiped and level-based roles have been synchronized.')
                .setColor(CONFIG.COLORS.ERROR);

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'info') {
            const rankData = await getUserRank(targetUser.id, guildId);
            
            if (!rankData) return interaction.editReply({ content: '❌ No records found for this user.' });

            const embed = baseEmbed('Leveling Archives', `Detailed records for **${targetUser.username}**.`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'Level', value: `${rankData.level}`, inline: true },
                    { name: 'Total XP', value: `${rankData.xp}`, inline: true },
                    { name: 'Global Rank', value: `#${rankData.rank}`, inline: true }
                )
                .setColor(CONFIG.COLORS.ARCHIVE);

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
