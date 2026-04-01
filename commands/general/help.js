const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View the archives of available commands and features.')
        .addStringOption(option => 
            option.setName('command')
                .setDescription('View detailed information about a specific command.')),
    async execute(interaction) {
        const { client, options: interactionOptions, member } = interaction;
        const commandQuery = interactionOptions.getString('command');

        if (commandQuery) {
            const command = client.commands.get(commandQuery.toLowerCase());
            if (!command) {
                return interaction.reply({ 
                    content: `🍂 I could not find a record for \`/${commandQuery}\` in the archives. Please ensure the title is correct.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const isModOnly = command.data.default_member_permissions !== undefined;
            const embed = baseEmbed(`📖 Volume: /${command.data.name}`, command.data.description, client.user.displayAvatarURL())
                .setThumbnail(client.user.displayAvatarURL());

            // Add Permissions Info
            if (isModOnly) {
                embed.addFields({ name: '🔐 Access Level', value: 'This volume is restricted to **Council Members/Administrators** only.' });
            }

            // Subcommands and Options
            const subcommands = command.data.options.filter(opt => opt.type === 1); // 1 = Subcommand
            const options = command.data.options.filter(opt => opt.type !== 1 && opt.type !== 2); // Standard options

            if (subcommands.length > 0) {
                embed.addFields({ 
                    name: '📜 Specialized Sub-Volumes', 
                    value: subcommands.map(sub => `• \`/${command.data.name} ${sub.name}\`: ${sub.description}`).join('\n') 
                });
            }

            if (options.length > 0) {
                embed.addFields({ 
                    name: '⚙️ Parameters', 
                    value: options.map(opt => `• \`${opt.name}\`${opt.required ? ' *' : ''}: ${opt.description}`).join('\n') 
                });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`help_back_to_archives_${interaction.user.id}`)
                    .setLabel('Return to Archives')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📚')
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // Standard Main Library Help (original logic)
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

        const embed = baseEmbed('📖 The Grand Library Archives', 'Welcome to the **AniMuse Library**. I am your automated archivist.\n\n' +
            'Every command is a volume in our collection. Select a **Wing** of the archives from the menu below to discover the services available to you.', 
            interaction.client.user.displayAvatarURL())
            .addFields(fields)
            .setThumbnail(interaction.client.user.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`help_wing_selector_${interaction.user.id}`)
                .setPlaceholder('Choose a Wing to explore...')
                .addOptions(options)
        );

        await interaction.reply({ 
            embeds: [embed], 
            components: [row]
        });
    }
};
