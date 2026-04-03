const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    category: 'utility',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something in a specific channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option => 
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel to send the message in (defaults to current)')
                .setRequired(false)),

    async execute(interaction) {
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Selected channel must be a text-based channel.', flags: MessageFlags.Ephemeral });
        }

        try {
            await channel.send(message);
            return interaction.reply({ content: `✅ Message sent to ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `❌ Failed to send message: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
};
