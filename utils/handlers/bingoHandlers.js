const { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    AttachmentBuilder, 
    ComponentType, 
    MessageFlags,
    EmbedBuilder
} = require('discord.js');

const {
    createUserBingo,
    addAnimeToBingo,
    fetchAndFillBingo,
    removeEntriesFromBingo,
    renameBingoCard,
    resizeBingoCard,
    getBingoCards,
    getBingoCardById,
    deleteBingoCard,
    syncBingoEntriesFromAnilist,
    updateBingoEntryStatus,
    shuffleBingoCard
} = require('../services/bingoService');

const {
    getUserColor: retrieveColor,
    getUserAvatarConfig: retrieveAvatarConfig,
    getLinkedAnilist,
    updateBingoCard
} = require('../core/database');

const { hasPremium } = require('../core/auth');
const { generateBingoCard } = require('../generators/bingoGenerator');
const { getAniListProfile } = require('../services/anilistService');
const baseEmbed = require('../generators/baseEmbed');
const { getLoadingMessage } = require('../config/loadingMessages');
const cache = require('../core/cache');
const logger = require('../core/logger');

// --- WIZARD RENDERER ---
const getBingoWizardPayload = (userId, step = 'MODE', state = {}) => {
    const { mode, size, type } = state;

    if (step === 'MODE') {
        const rowMode = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bingo_wiz_size_ANIME_${userId}`).setLabel('Anime').setStyle(ButtonStyle.Primary).setEmoji('📺'),
            new ButtonBuilder().setCustomId(`bingo_wiz_size_MANGA_${userId}`).setLabel('Manga').setStyle(ButtonStyle.Success).setEmoji('📖')
        );
        return {
            content: '🧩 **Let\'s build a new Bingo Card!**\nFirst, choose your media type to be archived:',
            components: [rowMode]
        };
    }

    if (step === 'SIZE') {
        const rowSize = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`bingo_wiz_type_select_${mode}_${userId}`)
                .setPlaceholder('Select Grid Size')
                .addOptions([
                    { label: '2x2 (Tiny)', value: '2', emoji: '🌱' },
                    { label: '3x3 (Casual)', value: '3', emoji: '🥉' },
                    { label: '4x4 (Standard)', value: '4', emoji: '🥈' },
                    { label: '5x5 (Hardcore)', value: '5', emoji: '🥇' }
                ])
        );
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bingo_wiz_mode_${userId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
        );
        return {
            content: `✅ **${mode === 'ANIME' ? 'Anime' : 'Manga'} Mode** selected.\nNow, choose your grid size:`,
            components: [rowSize, rowBack]
        };
    }

    if (step === 'TYPE') {
        const rowType = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bingo_wiz_final_monthly_${mode}_${size}_${userId}`).setLabel('Monthly').setStyle(ButtonStyle.Primary).setEmoji('📅'),
            new ButtonBuilder().setCustomId(`bingo_wiz_final_yearly_${mode}_${size}_${userId}`).setLabel('Yearly').setStyle(ButtonStyle.Success).setEmoji('🗓️'),
            new ButtonBuilder().setCustomId(`bingo_wiz_final_custom_${mode}_${size}_${userId}`).setLabel('Custom').setStyle(ButtonStyle.Secondary).setEmoji('✨')
        );
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bingo_wiz_size_${mode}_${userId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
        );
        return {
            content: `👍 **${size}x${size} Grid** selected.\nNow, what kind of bingo is this?`,
            components: [rowType, rowBack]
        };
    }
};

// --- DASHBOARD RENDERER ---
const renderBingoDashboard = async (interaction, cardId, userId) => {
    const guildId = interaction.guild.id;
    const card = await getBingoCardById(cardId);
    if (!card) return { content: '❌ **Archival Error**: Card not found in our records.', embeds: [], components: [], files: [] };

    const filledEntries = (card.entries || []).filter(e => e !== null);

    // 1. Generate Live Image
    const themeColor = await retrieveColor(userId, guildId) || '#FFACD1';
    const buffer = await generateBingoCard(card, interaction.client.user, themeColor);
    const attachment = new AttachmentBuilder(buffer, { name: 'bingo_live.webp' });

    const embed = baseEmbed(`⚙️ Dashboard: ${card.title}`, 
        `Manage your bingo progress. Total Filled: **${filledEntries.length}/${card.size * card.size}**\n\n` +
        (filledEntries.length > 0 ? "Select items below to remove them from this collection." : "*No items added to this record yet.*"),
        interaction.client.user.displayAvatarURL()
    ).setImage('attachment://bingo_live.webp');

    // 1a. Progress Bar
    const completed = filledEntries.filter(e => (e.status === 'COMPLETED' || e.status === 'FINISHED')).length;
    const total = card.size * card.size;
    const pct = Math.floor((completed / total) * 100);
    const barSize = 12;
    const filled = Math.round((completed / total) * barSize);
    const bar = '▓'.repeat(filled) + '░'.repeat(barSize - filled);
    
    embed.addFields(
        { name: 'Grid', value: `${card.size}x${card.size} ${card.mode || 'ANIME'}`, inline: true },
        { name: 'Type', value: card.type.toUpperCase(), inline: true },
        { name: 'Progress', value: `\`[${bar}]\` **${pct}%** (${completed}/${total})`, inline: true }
    );

    const rows = [];

    // 2. Remove Select Menu (if card has entries)
    if (filledEntries.length > 0) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`bingo_remove_${cardId}_${userId}`)
            .setPlaceholder(`Select ${card.mode === 'MANGA' ? 'Manga' : 'Anime'} to remove...`)
            .setMinValues(1)
            .setMaxValues(Math.min(filledEntries.length, 25))
            .addOptions(filledEntries.map(e => ({
                label: e.title.substring(0, 50),
                value: e.mediaId.toString(),
                emoji: '🗑️'
            })));
        rows.push(new ActionRowBuilder().addComponents(select));
    }

    // 3. Action Buttons
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bingo_dash_add_${cardId}_${userId}`).setLabel('Add').setStyle(ButtonStyle.Primary).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`bingo_dash_sync_${cardId}_${userId}`).setLabel('Sync').setStyle(ButtonStyle.Success).setEmoji('🔄'),
        new ButtonBuilder().setCustomId(`bingo_dash_status_${cardId}_${userId}`).setLabel('Status').setStyle(ButtonStyle.Secondary).setEmoji('🔖'),
        new ButtonBuilder().setCustomId(`bingo_dash_bg_${cardId}_${userId}`).setLabel('Wallpaper').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
        new ButtonBuilder().setCustomId(`bingo_dash_opts_${cardId}_${userId}`).setLabel('More').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );
    rows.push(buttons);

    return { content: '', embeds: [embed], components: rows, files: [attachment] };
};

/**
 * Helper to resolve a bingo card from an interaction or ask user via dropdown.
 */
const resolveCardInteraction = async (interaction, promptText) => {
    const cardIdOption = interaction.options ? interaction.options.getString('card') : null;
    const cards = await getBingoCards(interaction.user.id, interaction.guild.id);

    if (!cards.length) {
        await interaction.editReply({ content: '❌ You do not have any bingo cards. Use `/bingo create` to make one!' });
        return null;
    }

    // 1. Direct Match (ID or Title)
    if (cardIdOption) {
        const direct = cards.find(c => c.id.toString() === cardIdOption || c.title.toLowerCase() === cardIdOption.toLowerCase());
        if (direct) return direct;
    }

    // 2. Default if only one
    if (cards.length === 1) return cards[0];

    // 3. Ask User (Dropdown)
    const options = cards.map(c => ({
        label: c.title.substring(0, 25),
        description: `Size: ${c.size}x${c.size} • Filled: ${(c.entries || []).filter(e => e).length}`,
        value: c.id.toString()
    })).slice(0, 25);

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`bingo_wiz_select_helper_${interaction.user.id}`)
            .setPlaceholder('Select a bingo card...')
            .addOptions(options)
    );

    const msg = await interaction.editReply({
        content: `📂 **Multiple Cards Found**: ${promptText}`,
        components: [row]
    });

    try {
        const selection = await msg.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id && i.customId.includes('bingo_wiz_select_helper'),
            time: 30000,
            componentType: ComponentType.StringSelect
        });

        const selectedId = selection.values[0];
        await selection.update({ content: `⏳ **Accessing the Archives...**`, components: [] });

        return cards.find(c => c.id.toString() === selectedId);
    } catch (e) {
        await interaction.editReply({ content: '❌ **Archival Timeout**: Selection timed out.', components: [] });
        return null;
    }
};

// --- GLOBAL HANDLER ---
const handleBingoInteraction = async (interaction) => {
    const { customId, user, guild } = interaction;
    const parts = customId.split('_'); // bingo, action, ...params, userId
    const userId = user.id;

    // Acknowledge immediately
    try {
        if (!interaction.deferred && !interaction.replied && !customId.includes('modal')) {
            await interaction.deferUpdate();
        }
    } catch (e) { }

    // Security Check: Is the user the owner? (Last part of customId)
    const ownerId = parts[parts.length - 1];
    if (userId !== ownerId) {
        return interaction.reply({ content: '🔒 Only the owner of this archive record may modify it.', flags: MessageFlags.Ephemeral });
    }

    // --- WIZARD ACTIONS ---
    if (customId.startsWith('bingo_wiz_')) {
        const step = parts[2].toUpperCase(); // MODE, SIZE, TYPE, FINAL
        
        if (step === 'SIZE') {
            const mode = parts[3];
            return interaction.editReply(getBingoWizardPayload(userId, 'SIZE', { mode }));
        }
        if (step === 'MODE') {
            return interaction.editReply(getBingoWizardPayload(userId, 'MODE'));
        }
        if (step === 'TYPE') {
            const mode = parts[4];
            const size = interaction.values[0];
            return interaction.editReply(getBingoWizardPayload(userId, 'TYPE', { mode, size: parseInt(size) }));
        }
        if (step === 'FINAL') {
            const type = parts[3];
            const mode = parts[4];
            const size = parseInt(parts[5]);

            const modal = new ModalBuilder()
                .setCustomId(`bingo_modal_create_${type}_${mode}_${size}_${userId}`)
                .setTitle('Name your Bingo Card');

            const titleInput = new TextInputBuilder()
                .setCustomId('title_input')
                .setLabel("Card Title")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(40)
                .setRequired(true);

            // Auto-fill defaults
            const now = new Date();
            const month = now.toLocaleString('default', { month: 'long' });
            const year = now.getFullYear();
            titleInput.setValue(`${user.username}'s ${month} ${year} ${mode === 'MANGA' ? 'Manga' : 'Bingo'}`);

            modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
            return interaction.showModal(modal);
        }
    }

    // --- DASHBOARD ACTIONS ---
    if (customId.startsWith('bingo_dash_')) {
        const action = parts[2];
        const cardId = parseInt(parts[3]);

        if (action === 'sync') {
            await interaction.editReply({ content: '⏳ **Synchronizing with AniList Archives...**', embeds: [], components: [], files: [] });
            await syncBingoEntriesFromAnilist(cardId, userId, guild.id);
            const payload = await renderBingoDashboard(interaction, cardId, userId);
            return interaction.editReply({ content: '✅ **Archives Synchronized!**', ...payload });
        }

        if (action === 'opts') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bingo_dash_shuffle_${cardId}_${userId}`).setLabel('Shuffle').setStyle(ButtonStyle.Primary).setEmoji('🔀'),
                new ButtonBuilder().setCustomId(`bingo_dash_delete_${cardId}_${userId}`).setLabel('Delete Card').setStyle(ButtonStyle.Danger).setEmoji('💥'),
                new ButtonBuilder().setCustomId(`bingo_dash_home_${cardId}_${userId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
            );
            return interaction.editReply({ content: '🛠️ **Advanced Operations**', embeds: [], components: [row], files: [] });
        }

        if (action === 'home') {
            const payload = await renderBingoDashboard(interaction, cardId, userId);
            return interaction.editReply(payload);
        }

        if (action === 'shuffle') {
            await shuffleBingoCard(cardId);
            const payload = await renderBingoDashboard(interaction, cardId, userId);
            return interaction.editReply(payload);
        }

        if (action === 'delete') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bingo_dash_deleteconfirm_${cardId}_${userId}`).setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`bingo_dash_home_${cardId}_${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );
            return interaction.editReply({ content: '⚠️ **Permanent Deletion?** This cannot be undone.', embeds: [], components: [row] });
        }

        if (action === 'deleteconfirm') {
            await deleteBingoCard(cardId);
            return interaction.editReply({ content: '💥 **The card has been scrubbed from the archives.**', embeds: [], components: [] });
        }
    }
};

/**
 * Modal Submit Handler
 */
const handleBingoModals = async (interaction) => {
    const { customId, fields, user, guild } = interaction;
    const parts = customId.split('_'); // bingo, modal, action, ...params, userId

    if (customId.startsWith('bingo_modal_create_')) {
        const type = parts[3];
        const mode = parts[4];
        const size = parseInt(parts[5]);
        const title = fields.getTextInputValue('title_input');

        await interaction.deferUpdate();
        
        const loader = new (require('../ui/LoadingManager'))(interaction);
        loader.startThemedSteps('BINGO', 4, 1200);

        const result = await createUserBingo(user.id, guild.id, title, type, size, mode);
        await loader.stop();

        if (result.error) {
            return await interaction.editReply({ content: `❌ **Failed to Materialize**: ${result.error}`, embeds: [], components: [] });
        }

        return await interaction.editReply({
            content: `✅ **Card Materialized!** Created **${title}** (${size}x${size} ${mode}).\nUse the dashboard to fill it or sync with your AniList archives!`,
            embeds: [],
            components: []
        });
    }
};

module.exports = { 
    renderBingoDashboard, 
    handleBingoInteraction, 
    handleBingoModals, 
    getBingoWizardPayload,
    resolveCardInteraction,
    routerConfig: {
        prefixes: ['bingo_'],
        handle: async (interaction) => {
            if (interaction.isModalSubmit()) return handleBingoModals(interaction);
            return handleBingoInteraction(interaction);
        }
    }
};
