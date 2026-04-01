const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

const wingMapping = {
    help_general: { 
        categories: ['general', 'utility', 'system'], 
        title: '📚 General Wing: Basic Services', 
        description: 'Essential utilities for navigating the archives and monitoring systems.' 
    },
    help_media: { 
        categories: ['anime', 'search'], 
        title: '🅰️ Media Wing: Observations', 
        description: 'The core archives of anime tracking, schedules, and global search.' 
    },
    help_social: { 
        categories: ['social'], 
        title: '🎨 Aesthetic Wing: Personalization', 
        description: 'Enhance your visual presence and identity within the library.' 
    },
    help_games: { 
        categories: ['fun'], 
        title: '🎮 Games Wing: Simulations', 
        description: 'Participate in tactical and social games like Mafia and Bingo.' 
    },
    help_council: { 
        categories: ['moderation'], 
        title: '🛡️ Council Wing: Enforcement', 
        description: 'Staff-only protocols to maintain order through moderation and discipline.' 
    },
    help_management: { 
        categories: ['admin', 'configuration'], 
        title: '⚙️ Management Wing: Architecture', 
        description: 'Protocols for administrative architecture, designating channels, and system toggles.' 
    }
};

const handleHelpInteraction = async (interaction) => {
    const { customId, values, user, client, member } = interaction;
    
    // Security check: Only the user who ran /help can use the UI
    const targetUserId = customId.split('_').pop();
    if (user.id !== targetUserId) {
        return interaction.reply({ content: '❌ You did not invoke this help session. Use `/help` to start your own.', ephemeral: true });
    }

    // --- 1. Handle "Back to Archives" Button ---
    if (customId.startsWith('help_back_to_archives')) {
        const isMod = member.permissions.has(PermissionFlagsBits.BanMembers) || member.permissions.has(PermissionFlagsBits.ManageMessages);
        const isManager = member.permissions.has(PermissionFlagsBits.ManageGuild);
        
        const fields = [
            { name: '📚 General Wing', value: 'Essential utilities for every archivist.', inline: true },
            { name: '🅰️ Media Wing', value: 'Anime tracking and historical search.', inline: true },
            { name: '🎨 Aesthetic Wing', value: 'Profiles, visuals, and self-roles.', inline: true },
            { name: '🎮 Games Wing', value: 'Participate in Mafia and Bingo games.', inline: true }
        ];

        const options = [
            { label: 'General Wing', value: 'help_general', emoji: '📚', description: 'Basic archives and utilities.' },
            { label: 'Media Wing', value: 'help_media', emoji: '🅰️', description: 'Anime records and observation.' },
            { label: 'Aesthetic Wing', value: 'help_social', emoji: '🎨', description: 'Personalization and portraits.' },
            { label: 'Games Wing', value: 'help_games', emoji: '🎮', description: 'Social tactics and entertainment.' }
        ];

        if (isMod) {
            fields.push({ name: '🛡️ Council Wing', value: 'Staff-only moderation and discipline archives.', inline: true });
            options.push({ label: 'Council Wing', value: 'help_council', emoji: '🛡️', description: 'Moderation protocols.' });
        }

        if (isManager) {
            fields.push({ name: '⚙️ Management Wing', value: 'Administrative architecture and config files.', inline: true });
            options.push({ label: 'Management Wing', value: 'help_management', emoji: '⚙️', description: 'System configuration protocols.' });
        }

        const baseEmbed = require('../generators/baseEmbed');
        const embed = baseEmbed('📖 The Grand Library Archives', 
            'Welcome to the **AniMuse Library**. I am your automated archivist.\n\n' +
            'Every command is a volume in our collection. Select a **Wing** of the archives from the menu below to discover the services available to you.', 
            client.user.displayAvatarURL()
        )
            .addFields(fields)
            .setColor('#A78BFA');

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`help_wing_selector_${user.id}`)
                .setPlaceholder('Choose a Wing to explore...')
                .addOptions(options)
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    // --- 2. Handle Wing Selection ---
    const category = values[0];
    const data = wingMapping[category];
    if (!data) return;

    // Dynamically filter commands from the client based on mapped categories
    const wingCommands = [...client.commands.values()]
        .filter(cmd => data.categories.includes(cmd.category))
        .sort((a, b) => a.data.name.localeCompare(b.data.name));

    const baseEmbed = require('../generators/baseEmbed');
    const embed = baseEmbed(data.title, data.description, null)
        .setColor('#A78BFA');

    if (wingCommands.length > 0) {
        embed.addFields(wingCommands.map(cmd => ({
            name: `\`/${cmd.data.name}\``,
            value: cmd.data.description,
            inline: false
        })));
    } else {
        embed.setDescription(`${data.description}\n\n*This wing is currently being curated. No volumes found.*`);
    }

    // Dynamic Select Menu Construction
    const menuOptions = [
        { label: 'General Wing', value: 'help_general', emoji: '📚', description: 'Basic archives and utilities.' },
        { label: 'Media Wing', value: 'help_media', emoji: '🅰️', description: 'Anime records and observation.' },
        { label: 'Aesthetic Wing', value: 'help_social', emoji: '🎨', description: 'Personalization and portraits.' },
        { label: 'Games Wing', value: 'help_games', emoji: '🎮', description: 'Social tactics and entertainment.' }
    ];

    const isMod = member.permissions.has(PermissionFlagsBits.BanMembers) || member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isManager = member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (isMod) {
        menuOptions.push({ label: 'Council Wing', value: 'help_council', emoji: '🛡️', description: 'Moderation protocols.' });
    }

    if (isManager) {
        menuOptions.push({ label: 'Management Wing', value: 'help_management', emoji: '⚙️', description: 'System configuration protocols.' });
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`help_wing_selector_${user.id}`)
            .setPlaceholder('Switch to another Wing...')
            .addOptions(menuOptions)
    );

    await interaction.update({ embeds: [embed], components: [row] });
};

module.exports = { handleHelpInteraction };
