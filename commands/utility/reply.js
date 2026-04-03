const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    category: 'utility',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('reply')
        .setDescription('Make the bot reply to a message.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option => 
            option.setName('message_id')
                .setDescription('The ID of the message to reply to')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('message')
                .setDescription('The message to send as a reply')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('ping')
                .setDescription('Mention the user in the reply?')
                .setRequired(false))
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel the message is in (defaults to current)')
                .setRequired(false)),

    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');
        const messageText = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const ping = interaction.options.getBoolean('ping') ?? false;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Selected channel must be a text-based channel.', flags: MessageFlags.Ephemeral });
        }

        try {
            const targetMessage = await channel.messages.fetch(messageId);
            if (!targetMessage) {
                return interaction.reply({ content: '❌ Target message not found in this channel.', flags: MessageFlags.Ephemeral });
            }
            await targetMessage.reply({ content: messageText, allowedMentions: { repliedUser: ping } });
            return interaction.reply({ content: `✅ Reply sent to ${targetMessage.url}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `❌ Failed to send reply: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
};
