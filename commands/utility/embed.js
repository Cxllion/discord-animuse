const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

module.exports = {
    category: 'utility',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create a beautiful, custom embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option => option.setName('channel').setDescription('Where to send (defaults to current)').setRequired(false))
        .addStringOption(option => option.setName('content').setDescription('Message text outside the embed (e.g. pings)').setRequired(false))
        .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('Embed description (\n for new lines)').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g. #7289da)').setRequired(false))
        .addStringOption(option => option.setName('image').setDescription('Main image URL').setRequired(false))
        .addStringOption(option => option.setName('thumbnail').setDescription('Small corner image URL').setRequired(false))
        .addStringOption(option => option.setName('author_name').setDescription('Author text').setRequired(false))
        .addStringOption(option => option.setName('author_icon').setDescription('Author icon URL').setRequired(false))
        .addStringOption(option => option.setName('author_url').setDescription('Author link URL').setRequired(false))
        .addStringOption(option => option.setName('footer_text').setDescription('Footer text').setRequired(false))
        .addStringOption(option => option.setName('footer_icon').setDescription('Footer icon URL').setRequired(false))
        .addStringOption(option => option.setName('url').setDescription('Title link URL').setRequired(false))
        .addBooleanOption(option => option.setName('timestamp').setDescription('Include current time in footer?').setRequired(false)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const mainContent = interaction.options.getString('content');
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorInput = interaction.options.getString('color') || '#ffffff';
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');
        const authorName = interaction.options.getString('author_name');
        const authorIcon = interaction.options.getString('author_icon');
        const authorUrl = interaction.options.getString('author_url');
        const footerText = interaction.options.getString('footer_text');
        const footerIcon = interaction.options.getString('footer_icon');
        const url = interaction.options.getString('url');
        const timestamp = interaction.options.getBoolean('timestamp') ?? false;

        if (!channel.isTextBased()) {
            return interaction.reply({ 
                content: '❌ **Archival Error**: The selected channel does not support text-based records.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Validate hex color
        const colorRegex = /^#?[0-9A-F]{6}$/i;
        let color = 0xFFFFFF; // Default white
        if (colorInput && colorRegex.test(colorInput)) {
            color = parseInt(colorInput.replace('#', ''), 16);
        } else if (colorInput === 'random') {
            color = Math.floor(Math.random() * 16777215);
        }

        const embed = baseEmbed().setColor(color);

        if (title) {
            embed.setTitle(title);
            if (url) embed.setURL(url);
        }
        if (description) embed.setDescription(description.replace(/\\n/g, '\n'));
        if (image) embed.setImage(image);
        if (thumbnail) embed.setThumbnail(thumbnail);
        
        if (authorName) {
            embed.setAuthor({ 
                name: authorName, 
                iconURL: authorIcon || null,
                url: authorUrl || null
            });
        }

        if (footerText) {
            embed.setFooter({
                text: footerText,
                iconURL: footerIcon || null
            });
        }

        if (timestamp) embed.setTimestamp();

        try {
            await channel.send({ content: mainContent || null, embeds: [embed] });
            return interaction.reply({ 
                content: `✅ **Tome Delivered!**\nYour custom record has been placed in the ${channel} archives.`, 
                flags: MessageFlags.Ephemeral 
            });
        } catch (error) {
            console.error(error);
            return interaction.reply({ 
                content: `❌ **Delivery Failed**: ${error.message}\nEnsure all URLs are valid and I have sufficient clearance (permissions) in that channel.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
