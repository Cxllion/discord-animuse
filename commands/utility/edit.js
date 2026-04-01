const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Update one of the bot\'s existing messages or embeds.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option => option.setName('message_id').setDescription('ID of the bot message to edit').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Channel the message is in (defaults to current)').setRequired(false))
        .addStringOption(option => option.setName('content').setDescription('New message text outside the embed').setRequired(false))
        .addStringOption(option => option.setName('title').setDescription('New embed title').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('New embed description (\n for new lines)').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('New hex color code').setRequired(false))
        .addStringOption(option => option.setName('image').setDescription('New image URL').setRequired(false))
        .addStringOption(option => option.setName('thumbnail').setDescription('New thumbnail URL').setRequired(false))
        .addStringOption(option => option.setName('footer_text').setDescription('New footer text').setRequired(false))
        .addBooleanOption(option => option.setName('remove_embed').setDescription('Remove the embed from the message entirely?').setRequired(false)),

    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        
        const newContent = interaction.options.getString('content');
        const newTitle = interaction.options.getString('title');
        const newDescription = interaction.options.getString('description');
        const newColorInput = interaction.options.getString('color');
        const newImage = interaction.options.getString('image');
        const newThumbnail = interaction.options.getString('thumbnail');
        const newFooter = interaction.options.getString('footer_text');
        const removeEmbed = interaction.options.getBoolean('remove_embed') ?? false;

        if (!channel.isTextBased()) {
            return interaction.reply({ 
                content: '❌ **Archival Error**: The selected channel does not support text-based records.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            const targetMessage = await channel.messages.fetch(messageId);
            if (!targetMessage) {
                return interaction.reply({ 
                    content: '❌ **Archival Error**: Specified record not found in these archives.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (targetMessage.author.id !== interaction.client.user.id) {
                return interaction.reply({ 
                    content: '❌ **Archival Restriction**: I can only recalibrate records authored by myself.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const payload = {};
            if (newContent !== null) payload.content = newContent;

            if (removeEmbed) {
                payload.embeds = [];
            } else {
                // Get existing embed or create a new one if options are provided
                let embed = targetMessage.embeds[0] ? baseEmbed.from(targetMessage.embeds[0]) : null;
                
                // If no embed exists but user wants to add one via title/desc
                if (!embed && (newTitle || newDescription || newImage)) {
                    embed = baseEmbed().setColor(0xFFFFFF);
                }

                if (embed) {
                    if (newTitle !== null) embed.setTitle(newTitle);
                    if (newDescription !== null) embed.setDescription(newDescription.replace(/\\n/g, '\n'));
                    if (newImage !== null) embed.setImage(newImage || null);
                    if (newThumbnail !== null) embed.setThumbnail(newThumbnail || null);
                    if (newFooter !== null) embed.setFooter({ text: newFooter });
                    
                    if (newColorInput) {
                        const colorRegex = /^#?[0-9A-F]{6}$/i;
                        if (colorRegex.test(newColorInput)) {
                            embed.setColor(parseInt(newColorInput.replace('#', ''), 16));
                        }
                    }
                    
                    payload.embeds = [embed];
                }
            }

            if (Object.keys(payload).length === 0) {
                return interaction.reply({ 
                    content: '❌ **Archival Error**: You must provide at least one parameter to recalibrate.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await targetMessage.edit(payload);
            return interaction.reply({ 
                content: `✅ **Archival Entry Recalibrated.**\n[View the updated record](${targetMessage.url})`, 
                flags: MessageFlags.Ephemeral 
            });
        } catch (error) {
            console.error(error);
            return interaction.reply({ 
                content: `❌ **Recalibration Failed**: ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
