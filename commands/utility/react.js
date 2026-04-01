const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('react')
        .setDescription('Make the bot react to a message.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option => 
            option.setName('message_id')
                .setDescription('The ID of the message to react to')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('emoji')
                .setDescription('The emoji to react with (ID, name, or custom)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel the message is in (defaults to current)')
                .setRequired(false)),

    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');
        const emoji = interaction.options.getString('emoji');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Selected channel must be a text-based channel.', flags: MessageFlags.Ephemeral });
        }

        try {
            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return interaction.reply({ content: '❌ Message not found in this channel.', flags: MessageFlags.Ephemeral });
            }
            await message.react(emoji);
            return interaction.reply({ content: `✅ Successfully reacted with ${emoji} to the message.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `❌ Failed to add reaction: ${error.message}\nEnsure the bot has permissions and the emoji is valid.`, flags: MessageFlags.Ephemeral });
        }
    }
};
