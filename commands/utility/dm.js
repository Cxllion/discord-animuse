const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a user as the bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option => option.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('Message text outside the embed').setRequired(false))
        .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('Embed description (\n for new lines)').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g. #7289da)').setRequired(false))
        .addStringOption(option => option.setName('image').setDescription('Main image URL').setRequired(false))
        .addStringOption(option => option.setName('thumbnail').setDescription('Small corner image URL').setRequired(false))
        .addStringOption(option => option.setName('footer').setDescription('Footer text').setRequired(false))
        .addBooleanOption(option => option.setName('timestamp').setDescription('Include timestamp?').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const mainContent = interaction.options.getString('content');
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorInput = interaction.options.getString('color') || '#ffffff';
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');
        const footer = interaction.options.getString('footer');
        const timestamp = interaction.options.getBoolean('timestamp') ?? false;

        if (targetUser.bot) {
            return interaction.reply({ 
                content: '❌ **Archival Error**: I cannot dispatch correspondence to other bots.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        let embed = null;
        let hasEmbed = false;

        if (title || description || image || thumbnail || footer) {
            hasEmbed = true;
            
            // Validate hex color
            const colorRegex = /^#?[0-9A-F]{6}$/i;
            let color = '#ffffff'; // Default white
            if (colorInput && colorRegex.test(colorInput)) {
                color = colorInput.startsWith('#') ? colorInput : `#${colorInput}`;
            }
            
            embed = baseEmbed(title || null, description ? description.replace(/\\n/g, '\n') : null, thumbnail || null)
                .setColor(color);

            if (image) embed.setImage(image);
            if (footer) embed.setFooter({ text: footer });
            if (timestamp) embed.setTimestamp();
        }

        if (!mainContent && !hasEmbed) {
            return interaction.reply({ 
                content: '❌ **Archival Error**: You must provide at least a message content or an embed description for the scribe to write.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            await targetUser.send({
                content: mainContent || null,
                embeds: hasEmbed ? [embed] : []
            });
            return interaction.reply({ 
                content: `✅ **Correspondence Dispatched!**\nYour message has been delivered to **${targetUser.tag}**'s private study.`, 
                flags: MessageFlags.Ephemeral 
            });
        } catch (error) {
            console.error(error);
            return interaction.reply({ 
                content: `❌ **Dispatch Failed**: ${error.message}\nThis usually happens if the patron's archives are closed (DMs off) or they have blocked my access.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
