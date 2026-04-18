const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { fetchConfig, upsertConfig } = require('../core/database');
const baseEmbed = require('../generators/baseEmbed');
const logger = require('../core/logger');

/**
 * Renders the Welcome Wing (Welcome Management Dashboard)
 * @param {import('discord.js').Interaction} interaction 
 * @param {boolean} isUpdate 
 */
const displayWelcomeDashboard = async (interaction, isUpdate = false) => {
    const { getNavigationRow } = require('./roleDashboard');
    const config = await fetchConfig(interaction.guildId);

    const embed = baseEmbed()
        .setTitle('🚪 The Welcome Wing')
        .setDescription('Manage how new scholars are welcomed into your library archives. Configure custom welcome messages, automated greetings, and orientation briefing.')
        .addFields(
            { name: '🖼️ Welcome Channel', value: config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : '*Not Set*', inline: true },
            { name: '💬 Greeting Channel', value: config.greeting_channel_id ? `<#${config.greeting_channel_id}>` : '*Not Set*', inline: true },
            { name: '🤖 DM Briefing', value: config.welcome_dm_briefing !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '👻 Anti-Ghosting', value: config.welcome_antighost_enabled !== false ? '🛡️ Active' : '⚪ Inactive', inline: true },
            { name: '📜 Welcome Message', value: config.welcome_message ? `\`\`\`${config.welcome_message}\`\`\`` : '*Default (None)*', inline: false },
            { name: '👋 Random Greetings', value: config.greeting_messages?.length > 0 ? `\`${config.greeting_messages.length}\` custom greetings indexed.` : '*System Defaults*', inline: false }
        )
        .setFooter({ text: 'Use {user} to mention the new arrival in your messages.' });

    const btnRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('welcome_edit_msg').setLabel('Set Welcome Message').setStyle(ButtonStyle.Primary).setEmoji('📝'),
        new ButtonBuilder().setCustomId('welcome_manage_greetings').setLabel('Manage Greetings').setStyle(ButtonStyle.Primary).setEmoji('👋'),
        new ButtonBuilder().setCustomId('welcome_toggle_dm').setLabel('Toggle DM Briefing').setStyle(config.welcome_dm_briefing !== false ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('📩')
    );

    const btnRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('welcome_test_run').setLabel('Run Simulation').setStyle(ButtonStyle.Secondary).setEmoji('🧪'),
        new ButtonBuilder().setCustomId('welcome_toggle_ghost').setLabel('Anti-Ghost Protocol').setStyle(config.welcome_antighost_enabled !== false ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🛡️'),
        new ButtonBuilder().setCustomId('role_dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
    );

    const rows = [getNavigationRow(interaction, 'opt_welcome'), btnRow1, btnRow2];

    if (isUpdate) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [embed], components: rows });
        } else {
            await interaction.update({ embeds: [embed], components: rows });
        }
    } else {
        await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
    }
};

/**
 * Handles interactions for the Welcome Wing
 * @param {import('discord.js').Interaction} interaction 
 */
const handleWelcomeInteraction = async (interaction) => {
    const { customId } = interaction;

    if (customId === 'welcome_edit_msg') {
        const config = await fetchConfig(interaction.guildId);
        const modal = new ModalBuilder()
            .setCustomId('modal_welcome_msg')
            .setTitle('Custom Welcome Message');

        const messageInput = new TextInputBuilder()
            .setCustomId('welcome_msg_input')
            .setLabel('Message Content ({user} for mention)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Welcome to the archives, {user}!')
            .setValue(config.welcome_message || '')
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
        await interaction.showModal(modal);
    }

    else if (customId === 'welcome_manage_greetings') {
        const config = await fetchConfig(interaction.guildId);
        const modal = new ModalBuilder()
            .setCustomId('modal_welcome_greetings')
            .setTitle('Manage Random Greetings');

        const greetingsInput = new TextInputBuilder()
            .setCustomId('greetings_input')
            .setLabel('One greeting per line ({user} for mention)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Welcome, {user}!\nA new face: {user}!')
            .setValue(config.greeting_messages?.join('\n') || '')
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(greetingsInput));
        await interaction.showModal(modal);
    }

    else if (customId === 'welcome_toggle_dm') {
        const config = await fetchConfig(interaction.guildId);
        const newState = config.welcome_dm_briefing === false;
        await upsertConfig(interaction.guildId, { welcome_dm_briefing: newState });
        return displayWelcomeDashboard(interaction, true);
    }

    else if (customId === 'welcome_toggle_ghost') {
        const config = await fetchConfig(interaction.guildId);
        const newState = config.welcome_antighost_enabled === false;
        await upsertConfig(interaction.guildId, { welcome_antighost_enabled: newState });
        return displayWelcomeDashboard(interaction, true);
    }

    else if (customId === 'welcome_test_run') {
        await interaction.deferUpdate();
        // Use the feature test command's logic
        const { generateWelcomeCard } = require('../generators/welcomeGenerator');
        const { AttachmentBuilder } = require('discord.js');
        const config = await fetchConfig(interaction.guildId);
        
        if (!config.welcome_channel_id) {
            return await interaction.followUp({ content: '❌ **Error**: No Welcome Channel configured. Assign one in the Channel Architect.', flags: MessageFlags.Ephemeral });
        }

        const channel = interaction.guild.channels.cache.get(config.welcome_channel_id);
        if (!channel) return await interaction.followUp({ content: '❌ **Error**: Configured channel no longer exists.', flags: MessageFlags.Ephemeral });

        try {
            const buffer = await generateWelcomeCard(interaction.member);
            const attachment = new AttachmentBuilder(buffer, { name: 'welcome-simulation.webp' });
            
            const messageOptions = {
                content: `**[Welcome Simulation]** triggered by ${interaction.user.tag}`,
                files: [attachment]
            };

            if (config.welcome_message) {
                messageOptions.content += `\n\n**Custom Message:**\n${config.welcome_message.replace(/{user}/g, interaction.member.toString())}`;
            }

            await channel.send(messageOptions);
            await interaction.followUp({ content: `✅ **Simulation Sent** to ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            logger.error('Welcome Simulation Failed:', error);
            await interaction.followUp({ content: '❌ **Simulation Failed**: ' + error.message, flags: MessageFlags.Ephemeral });
        }
    }

    // Modal Submissions
    if (interaction.isModalSubmit()) {
        if (customId === 'modal_welcome_msg') {
            const msg = interaction.fields.getTextInputValue('welcome_msg_input');
            await upsertConfig(interaction.guildId, { welcome_message: msg || null });
            await interaction.reply({ content: '✅ **Welcome message updated.**', flags: MessageFlags.Ephemeral });
            return displayWelcomeDashboard(interaction, true);
        }
        
        if (customId === 'modal_welcome_greetings') {
            const lines = interaction.fields.getTextInputValue('greetings_input');
            const greetings = lines.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            await upsertConfig(interaction.guildId, { greeting_messages: greetings });
            await interaction.reply({ content: `✅ **Greetings updated.** (${greetings.length} entries)`, flags: MessageFlags.Ephemeral });
            return displayWelcomeDashboard(interaction, true);
        }
    }
};

module.exports = { 
    displayWelcomeDashboard, 
    handleWelcomeInteraction,
    routerConfig: {
        prefixes: ['welcome_', 'modal_welcome_'],
        handle: handleWelcomeInteraction
    }
};
