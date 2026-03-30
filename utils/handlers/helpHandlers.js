const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const helpData = {
    help_general: {
        title: '📚 General Wing: Basic Archives',
        description: 'Core utilities for navigating and monitoring the library.',
        commands: [
            { name: 'help', desc: 'Opens these archives.' },
            { name: 'status', desc: 'Check the real-time health of the bot and database.' },
            { name: 'ping', desc: 'Measure the connection heartbeat.' },
            { name: 'info', desc: 'General information about AniMuse.' },
            { name: 'serverinfo', desc: 'Display details about this Discord guild.' },
            { name: 'invite', desc: 'Get a link to bring AniMuse to your own library.' }
        ]
    },
    help_admin: {
        title: '🛡️ Council Wing: Governance',
        description: 'Moderation systems and low-level server configuration.',
        commands: [
            { name: 'dashboard', desc: 'Central management hub for all server features.' },
            { name: 'channel assign', desc: 'Designate specific channels for features.' },
            { name: 'feature toggle', desc: 'Enable or disable library modules.' },
            { name: 'clear', desc: 'Bulk purge messages from the archives.' },
            { name: 'ban / kick / mute', desc: 'Enforce order within the guild.' }
        ]
    },
    help_social: {
        title: '🎨 Aesthetic Wing: Personalization',
        description: 'Manage your profile and how you are perceived in the archives.',
        commands: [
            { name: 'profile', desc: 'View your highly detailed portrait card.' },
            { name: 'link', desc: 'Synchronize your AniList account with the library.' },
            { name: 'leaderboard', desc: 'See who has read the most in this guild.' },
            { name: 'selfrole', desc: 'Grant yourself specialized roles.' }
        ]
    },
    help_media: {
        title: '🅰️ Media Wing: Anime & Literature',
        description: 'The core of AniMuse—tracking, bingo, and database search.',
        commands: [
            { name: 'track add/list', desc: 'Monitor airing anime and receive pings.' },
            { name: 'bingo create/view', desc: 'Interactive bingo system for seasons or events.' },
            { name: 'search anime/manga', desc: 'Search the global archives of media.' },
            { name: 'mafia', desc: 'Engage in the library\'s deduction game.' }
        ]
    }
};

const handleHelpInteraction = async (interaction) => {
    const { customId, values, user } = interaction;
    const category = values[0];
    const data = helpData[category];

    if (!data) return;

    // Security check: Only the user who ran /help can use the menu
    const targetUserId = customId.split('_').pop();
    if (user.id !== targetUserId) {
        return interaction.reply({ content: '❌ You did not invoke this help session. Use `/help` to start your own.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .addFields(data.commands.map(cmd => ({
            name: `\`/${cmd.name}\``,
            value: cmd.desc,
            inline: false
        })))
        .setColor('#A78BFA')
        .setFooter({ text: '✦ Use the menu below to switch between categories.' })
        .setTimestamp();

    // Re-add the select menu so they can switch again
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`help_wing_selector_${user.id}`)
            .setPlaceholder('Switch to another Wing...')
            .addOptions([
                { label: 'General Wing', value: 'help_general', emoji: '📚', description: 'Utilities, help, and ping.' },
                { label: 'Council Wing', value: 'help_admin', emoji: '🛡️', description: 'Moderation and Configuration.' },
                { label: 'Aesthetic Wing', value: 'help_social', emoji: '🎨', description: 'Profiles and social settings.' },
                { label: 'Media Wing', value: 'help_media', emoji: '🅰️', description: 'Anime Tracking and Bingo.' }
            ])
    );

    await interaction.update({ embeds: [embed], components: [row] });
};

module.exports = { handleHelpInteraction };
