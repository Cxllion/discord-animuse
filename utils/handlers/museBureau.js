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
const { fetchConfig, assignChannel } = require('../core/database');
const { getDynamicUserTitle } = require('../core/userMeta');
const baseEmbed = require('../generators/baseEmbed');
const supabase = require('../core/supabaseClient');

/**
 * Renders the Muse Bureau (Misc Dashboard)
 * @param {import('discord.js').Interaction} interaction 
 * @param {boolean} isUpdate 
 */
const displayMuseBureau = async (interaction, isUpdate = false) => {
    const { getNavigationRow } = require('./roleDashboard');
    const config = await fetchConfig(interaction.guildId);
    const title = await getDynamicUserTitle(interaction.member);

    const embed = baseEmbed()
        .setTitle('🎭 The Muse Bureau')
        .setDescription(`Welcome, **${title}**, to the auxiliary wing of the Archives. Here you can fine-tune the bot's miscellaneous behaviors and aesthetic flavor.`)
        .addFields(
            { name: '✨ Level-Up Reaction', value: config.xp_level_up_emoji || '`<a:level_up:1483138860417286358>`', inline: true },
            { name: '📍 Local Announcements', value: '`Enabled` (Localized)', inline: true }
        )
        .setFooter({ text: 'These settings apply server-wide.' });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('muse_edit_emoji').setLabel('Set Level-Up Emoji').setStyle(ButtonStyle.Primary).setEmoji('✨'),
        new ButtonBuilder().setCustomId('role_dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );

    const rows = [getNavigationRow(interaction, 'opt_muses'), btnRow];

    if (isUpdate) {
        await interaction.update({ embeds: [embed], components: rows });
    } else {
        await interaction.reply({ embeds: [embed], components: rows });
    }
};

/**
 * Handles interactions for the Muse Bureau
 * @param {import('discord.js').Interaction} interaction 
 */
const handleMuseBureauInteraction = async (interaction) => {
    const { customId } = interaction;

    if (customId === 'muse_edit_emoji') {
        const config = await fetchConfig(interaction.guildId);
        const modal = new ModalBuilder()
            .setCustomId('muse_emoji_modal')
            .setTitle('Custom Level-Up Emoji');

        const emojiInput = new TextInputBuilder()
            .setCustomId('emoji_input')
            .setLabel('Emoji ID or Full String')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('<a:level_up:1483138860417286358>')
            .setValue(config.xp_level_up_emoji || '')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
        await interaction.showModal(modal);

        try {
            const submitted = await interaction.awaitModalSubmit({ time: 60000 });
            const newEmoji = submitted.fields.getTextInputValue('emoji_input');

            // Update DB
            await supabase.from('guild_configs').update({ xp_level_up_emoji: newEmoji }).eq('guild_id', interaction.guildId);
            
            await submitted.reply({ content: `✅ Level-Up reaction updated to: ${newEmoji}`, flags: MessageFlags.Ephemeral });
            return displayMuseBureau(interaction, true);
        } catch (e) {
            // Modal timeout
        }
    }
};

module.exports = { 
    displayMuseBureau, 
    handleMuseBureauInteraction,
    routerConfig: {
        prefixes: ['muse_'],
        handle: handleMuseBureauInteraction
    }
};
