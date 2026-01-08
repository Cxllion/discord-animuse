const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    ComponentType,
    MessageFlags
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
    deleteBingoCard
} = require('../../utils/services/bingoService');

const {
    getUserColor: retrieveColor,
    getUserAvatarConfig: retrieveAvatarConfig,
    getLinkedAnilist
} = require('../../utils/core/database');

const { generateBingoCard } = require('../../utils/generators/bingoGenerator');
const { searchMedia, getAniListProfile } = require('../../utils/services/anilistService');
const { watchInteraction } = require('../../utils/handlers/interactionManager');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { getLoadingMessage } = require('../../utils/config/loadingMessages');
const cache = require('../../utils/core/cache');
const logger = require('../../utils/core/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingo')
        .setDescription('Manage your anime bingo cards.')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View a specific bingo card.')
                .addUserOption(opt => opt.setName('user').setDescription('User to view (default: you).'))
                .addStringOption(opt => opt.setName('card').setDescription('Specific card title or ID.').setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new bingo card using a wizard.')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add an anime to your bingo card.')
                .addStringOption(opt => opt.setName('anime').setDescription('Anime name to search.').setRequired(true).setAutocomplete(true))
                .addStringOption(opt => opt.setName('card').setDescription('Target card (default: latest).').setAutocomplete(true))
                .addIntegerOption(opt => opt.setName('slot').setDescription('Specific slot number (1-25).'))
        )
        .addSubcommand(sub =>
            sub.setName('fetch')
                .setDescription('Auto-fill your bingo card from your AniList Planning list.')
                .addStringOption(opt => opt.setName('card').setDescription('Target card.').setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit or delete a bingo card.')
                .addStringOption(opt => opt.setName('card').setDescription('Card to manage.').setRequired(true).setAutocomplete(true))
        ),

    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'anime') {
            const query = focusedOption.value;
            if (!query) return await interaction.respond([]);

            // Detect card mode if possible
            const cardId = interaction.options.getString('card');
            let mode = null; // searchMedia handles null as both
            if (cardId) {
                const card = await getBingoCardById(cardId);
                if (card) mode = card.mode;
            }

            try {
                const results = await searchMedia(query, mode);
                await interaction.respond(
                    results.slice(0, 25).map(m => ({
                        name: `[${m.format || '?'}] ${(m.title.english || m.title.romaji).substring(0, 90)}`,
                        value: m.id.toString()
                    }))
                );
            } catch (e) {
                await interaction.respond([]);
            }
        } else if (focusedOption.name === 'card') {
            // Suggest User's Cards
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const cards = await getBingoCards(userId, guildId);
            const query = focusedOption.value.toLowerCase();

            const filtered = cards.filter(c => c.title.toLowerCase().includes(query));
            await interaction.respond(
                filtered.slice(0, 25).map(c => ({
                    name: `${c.title} (${c.size}x${c.size})`,
                    value: c.id.toString()
                }))
            );
        }
    },

    async execute(interaction) {
        // OFFLINE MODE CHECK
        if (interaction.client.isOfflineMode) {
            return await interaction.reply({
                content: '⚠️ **The Archives are currently sealed.** (Database Offline)\nBingo cards cannot be managed at this time.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // --- CREATE WIZARD ---
        if (subcommand === 'create') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Step 0: Mode Selection
            const rowMode = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ANIME').setLabel('Anime').setStyle(ButtonStyle.Primary).setEmoji('📺'),
                new ButtonBuilder().setCustomId('MANGA').setLabel('Manga').setStyle(ButtonStyle.Success).setEmoji('📖')
            );

            const msg = await interaction.editReply({
                content: '🧩 **Let\'s build a new Bingo Card!**\nFirst, choose your media type:',
                components: [rowMode]
            });

            // Wizard State
            let mode = 'ANIME';
            let size = 3;
            let type = 'custom';
            let title = '';

            const filter = i => i.user.id === interaction.user.id;

            try {
                // Wait for Mode
                const modeInt = await msg.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 60000 });
                mode = modeInt.customId;
                await modeInt.deferUpdate();

                // Step 1: Size Selection
                const rowSize = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('bingo_size_select')
                        .setPlaceholder('Select Grid Size')
                        .addOptions([
                            { label: '2x2 (Tiny)', value: '2', emoji: '🌱' },
                            { label: '3x3 (Casual)', value: '3', emoji: '🥉' },
                            { label: '4x4 (Standard)', value: '4', emoji: '🥈' },
                            { label: '5x5 (Hardcore)', value: '5', emoji: '🥇' }
                        ])
                );

                await interaction.editReply({
                    content: `✅ **${mode === 'ANIME' ? 'Anime' : 'Manga'} Mode** selected.\nNow, choose your grid size:`,
                    components: [rowSize]
                });

                // Wait for Size
                const sizeInt = await msg.awaitMessageComponent({ filter, componentType: ComponentType.StringSelect, time: 60000 });
                size = parseInt(sizeInt.values[0]);
                await sizeInt.deferUpdate();

                // Step 2: Type Selection
                const rowType = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('monthly').setLabel('Monthly').setStyle(ButtonStyle.Primary).setEmoji('📅'),
                    new ButtonBuilder().setCustomId('yearly').setLabel('Yearly').setStyle(ButtonStyle.Success).setEmoji('🗓️'),
                    new ButtonBuilder().setCustomId('custom').setLabel('Custom').setStyle(ButtonStyle.Secondary).setEmoji('✨')
                );

                await interaction.editReply({
                    content: `👍 **${size}x${size} Grid** selected.\nNow, what kind of bingo is this?`,
                    components: [rowType]
                });

                const typeInt = await msg.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 60000 });
                type = typeInt.customId;

                // Step 3: Title (Modal)
                const modal = new ModalBuilder()
                    .setCustomId('bingo_title_modal')
                    .setTitle('Name your Bingo Card');

                const titleInput = new TextInputBuilder()
                    .setCustomId('title_input')
                    .setLabel("Card Title")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(40) // Increased slightly for names
                    .setRequired(true);

                // Auto-fill suggestions
                const now = new Date();
                const month = now.toLocaleString('default', { month: 'long' });
                const year = now.getFullYear();
                const displayName = interaction.member?.displayName || interaction.user.displayName;

                if (type === 'monthly') titleInput.setValue(`${displayName}'s ${month} ${year} ${mode === 'MANGA' ? 'Manga' : 'Bingo'}`);
                if (type === 'yearly') titleInput.setValue(`${displayName}'s ${year} ${mode === 'MANGA' ? 'Readlog' : 'Watchlog'}`);
                if (type === 'custom') titleInput.setValue(`${displayName}'s Custom Bingo`);

                modal.addComponents(new ActionRowBuilder().addComponents(titleInput));

                await typeInt.showModal(modal);

                // Wait for Modal
                const modalSubmit = await typeInt.awaitModalSubmit({ filter, time: 120000 });
                title = modalSubmit.fields.getTextInputValue('title_input');
                await modalSubmit.deferUpdate();

                // Finalize
                await interaction.editReply({ content: '🔨 **Crafting your card...**', components: [] });

                const result = await createUserBingo(interaction.user.id, interaction.guild.id, title, type, size, mode);

                if (result.error) {
                    return await interaction.editReply({ content: `❌ **Error**: ${result.error}` });
                }

                await interaction.editReply({
                    content: `✅ **Success!** Created **${title}** (${size}x${size} ${mode}).\nUse \`/bingo add\` or \`/bingo fetch\` to fill it!`
                });

                // FETCH CUSTOMIZATIONS
                const [themeColor, avatarConfig] = await Promise.all([
                    retrieveColor(interaction.user.id, interaction.guild.id),
                    retrieveAvatarConfig(interaction.user.id, interaction.guild.id)
                ]);

                // Resolve Avatar URL
                let avatarUrl = interaction.user.displayAvatarURL({ extension: 'png' });
                if (avatarConfig) {
                    if (avatarConfig.source === 'CUSTOM' && avatarConfig.customUrl) {
                        avatarUrl = avatarConfig.customUrl;
                    } else if (avatarConfig.source === 'ANILIST') {
                        const linkedUser = await getLinkedAnilist(interaction.user.id, interaction.guild.id);
                        if (linkedUser) {
                            const { avatar } = await getAniListProfile(linkedUser);
                            if (avatar) avatarUrl = avatar;
                        }
                    } else if (avatarConfig.source === 'DISCORD_GUILD') {
                        if (interaction.member) avatarUrl = interaction.member.displayAvatarURL({ extension: 'png' });
                    }
                }

                // Show the empty card immediately?
                // The verification plan says "Verify Customization (Generate Card)".
                // Usually create just confirms. But let's verify if we should show it.
                // The previous code didn't show it. But let's stick to the plan: modify generator signature.
                // Actual generation happens in 'view'. Wait, the prompted code block was for 'create'.
                // Ah, 'create' doesn't call generateBingoCard in the original code.
                // Let's checking the original code again.


            } catch (e) {
                logger.error('Bingo creation wizard error:', e, 'Bingo');
                await interaction.editReply({ content: '❌ **Timeout**: Bingo creation cancelled.', components: [] });
            }
        }

        // --- VIEW ---
        else if (subcommand === 'view') {
            await interaction.deferReply();
            await interaction.editReply({ content: `⏳ **${getLoadingMessage('BINGO')}**` });
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const cardIdStr = interaction.options.getString('card');

            // 1. Fetch Cards
            const cards = await getBingoCards(targetUser.id, interaction.guild.id);
            if (!cards || cards.length === 0) {
                return await interaction.editReply({ content: `📂 **${targetUser.username}** has no bingo cards yet.` });
            }

            let card;
            if (cardIdStr) {
                // Try finding by ID
                card = await getBingoCardById(cardIdStr);
                // Or title match logic handled by autocomplete
                if (!card) card = cards.find(c => c.title.toLowerCase() === cardIdStr.toLowerCase());
            } else {
                card = cards[0]; // Default to latest
            }

            if (!card) {
                return await interaction.editReply({ content: '❌ Card not found.' });
            }

            // Function to render and update
            const render = async (c) => {
                // FETCH CUSTOMIZATIONS
                const [themeColor, avatarConfig] = await Promise.all([
                    retrieveColor(targetUser.id, interaction.guild.id),
                    retrieveAvatarConfig(targetUser.id, interaction.guild.id)
                ]);

                // Resolve Avatar URL
                let avatarUrl = targetUser.displayAvatarURL({ extension: 'png' });

                if (avatarConfig) {
                    if (avatarConfig.source === 'CUSTOM' && avatarConfig.customUrl) {
                        avatarUrl = avatarConfig.customUrl;
                    } else if (avatarConfig.source === 'ANILIST') {
                        const linkedUser = await getLinkedAnilist(targetUser.id, interaction.guild.id);
                        if (linkedUser) {
                            const { avatar } = await getAniListProfile(linkedUser);
                            if (avatar) avatarUrl = avatar;
                        }
                    } else if (avatarConfig.source === 'DISCORD_GUILD') {
                        const member = interaction.guild.members.cache.get(targetUser.id) || await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                        if (member) avatarUrl = member.displayAvatarURL({ extension: 'png' });
                    }
                }

                // Check Cache
                const cacheKey = `bingo_${c.id}_${c.updated_at || 'initial'}_${themeColor}_${avatarUrl}`;
                let buffer = cache.get(cacheKey);

                if (!buffer) {
                    buffer = await generateBingoCard(c, targetUser, themeColor, avatarUrl);
                    cache.set(cacheKey, buffer, 300000); // 5 minutes cache
                }
                const att = new AttachmentBuilder(buffer, { name: 'bingo.png' });

                // Dropdown for switching
                const options = cards.map(item => ({
                    label: item.title.substring(0, 25),
                    description: `${item.size}x${item.size} • ${item.entries.filter(e => e).length} filled`,
                    value: item.id.toString(),
                    default: item.id === c.id
                }));

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('bingo_view_switch')
                        .setPlaceholder('Select another card')
                        .addOptions(options.slice(0, 25)) // Limit 25
                );

                return { files: [att], components: cards.length > 1 ? [row] : [] };
            };

            const initialPayload = await render(card);
            // Explicitly clear content
            const sentMsg = await interaction.editReply({ content: '', ...initialPayload });

            // Interaction Watcher for switching
            watchInteraction(sentMsg, 60000, async (i) => {
                if (i.customId === 'bingo_view_switch') {
                    if (i.user.id !== interaction.user.id) return i.reply({ content: 'Not your menu!', flags: MessageFlags.Ephemeral });

                    const newId = i.values[0];
                    const newCard = cards.find(x => x.id === newId); // Local lookup safer
                    if (newCard) {
                        await i.update({ content: `⏳ **${getLoadingMessage('BINGO')}**`, components: [] });
                        const newPayload = await render(newCard);
                        await i.editReply({ content: '', ...newPayload });
                    }
                }
            });
        }

        // Helper to resolve card or ask user
        const resolveCardInteraction = async (interaction, promptText) => {
            const cardIdOption = interaction.options.getString('card');
            const cards = await getBingoCards(interaction.user.id, interaction.guild.id);

            if (!cards.length) {
                await interaction.editReply({ content: '❌ You do not have any bingo cards. Use `/bingo create` to make one!' });
                return null;
            }

            // 1. Direct Match (ID or Title if autocomplete provided)
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
                    .setCustomId('bingo_select_helper')
                    .setPlaceholder('Select a bingo card...')
                    .addOptions(options)
            );

            const msg = await interaction.editReply({
                content: `📂 **Multiple Cards Found**: ${promptText}`,
                components: [row]
            });

            try {
                const selection = await msg.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id && i.customId === 'bingo_select_helper',
                    time: 30000,
                    componentType: ComponentType.StringSelect
                });

                const selectedId = selection.values[0];
                await selection.update({ content: `⏳ **${getLoadingMessage('BINGO')}**`, components: [] });

                return cards.find(c => c.id.toString() === selectedId);
            } catch (e) {
                await interaction.editReply({ content: '❌ Selection timed out.', components: [] });
                return null;
            }
        };

        // Shared Dashboard Rendering Logic
        const renderDashboard = async (cardId) => {
            const card = await getBingoCardById(cardId);
            if (!card) return { content: '❌ Card not found.', embeds: [], components: [], files: [] };

            const filledEntries = (card.entries || []).filter(e => e !== null);

            // 1. Generate Live Image
            const themeColor = await retrieveColor(interaction.user.id, interaction.guild.id) || '#FFACD1';
            const buffer = await generateBingoCard(card, interaction.client.user, themeColor);
            const attachment = new AttachmentBuilder(buffer, { name: 'bingo_live.png' });

            const embed = baseEmbed()
                .setTitle(`⚙️ Dashboard: ${card.title}`)
                .setDescription(`Manage your bingo progress. Total Filled: **${filledEntries.length}/${card.size * card.size}**\n\n` +
                    (filledEntries.length > 0 ? "Select items below to remove them." : "_No items added yet._"))
                .addFields(
                    { name: 'Grid', value: `${card.size}x${card.size} ${card.mode || 'ANIME'}`, inline: true },
                    { name: 'Type', value: card.type.toUpperCase(), inline: true }
                )
                .setImage('attachment://bingo_live.png');

            const rows = [];

            // 2. Remove Select Menu (if card has entries)
            if (filledEntries.length > 0) {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('bingo_remove_items')
                    .setPlaceholder(`Select ${card.mode === 'MANGA' ? 'Manga' : 'Anime'} to remove...`)
                    .setMinValues(1)
                    .setMaxValues(Math.min(filledEntries.length, 25))
                    .addOptions(filledEntries.map(e => ({
                        label: e.title.substring(0, 50),
                        description: `ID: ${e.mediaId}`,
                        value: e.mediaId.toString(),
                        emoji: '🗑️'
                    })));
                rows.push(new ActionRowBuilder().addComponents(select));
            }

            // 3. Action Buttons
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bingo_add_modal').setLabel(`Add ${card.mode === 'MANGA' ? 'Manga' : 'Anime'}`).setStyle(ButtonStyle.Primary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('bingo_refetch').setLabel('Fetch AniList').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('bingo_rename_modal').setLabel('Rename').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
                new ButtonBuilder().setCustomId('bingo_resize_modal').setLabel('Resize').setStyle(ButtonStyle.Secondary).setEmoji('📏'),
                new ButtonBuilder().setCustomId('delete_bingo').setLabel('Delete Card').setStyle(ButtonStyle.Danger).setEmoji('💥')
            );
            rows.push(buttons);

            return { content: '', embeds: [embed], components: rows, files: [attachment] };
        };

        // Shared Dashboard Collector Logic
        const startDashboardCollector = (msg, targetCardId) => {
            const collector = msg.createMessageComponentCollector({ time: 300000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: 'Not your dashboard.', flags: MessageFlags.Ephemeral });

                if (i.customId === 'bingo_remove_items') {
                    await i.update({ content: '⏳ Removing selected records...', components: [] });
                    const res = await removeEntriesFromBingo(targetCardId, i.values);
                    if (res.error) return i.followUp({ content: `❌ Error: ${res.error}`, flags: MessageFlags.Ephemeral });

                    const next = await renderDashboard(targetCardId);
                    await i.editReply({ content: `✅ Removed **${i.values.length}** items and blacklisted them for future syncs.`, ...next });
                }

                else if (i.customId === 'bingo_refetch') {
                    await i.update({ content: `⏳ **${getLoadingMessage('BINGO')}**`, components: [] });
                    const res = await fetchAndFillBingo(targetCardId, interaction.user.id, interaction.guild.id);

                    const next = await renderDashboard(targetCardId);
                    if (res.error) {
                        return await i.editReply({ content: `❌ **Fetch Failed**: ${res.error}`, ...next });
                    }
                    await i.editReply({ content: `✅ **Fetch Complete**! Added **${res.count}** new titles.`, ...next });
                }

                else if (i.customId === 'bingo_rename_modal') {
                    const card = await getBingoCardById(targetCardId);
                    const modal = new ModalBuilder()
                        .setCustomId('bingo_edit_rename_modal')
                        .setTitle('Rename Bingo Card')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('card_title')
                                    .setLabel('New Title')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(50)
                                    .setValue(card.title)
                            )
                        );
                    await i.showModal(modal);

                    try {
                        const submitted = await i.awaitModalSubmit({ time: 60000 });
                        await submitted.deferUpdate();

                        const newTitle = submitted.fields.getTextInputValue('card_title');
                        const result = await renameBingoCard(targetCardId, newTitle);

                        if (result.error) {
                            return await submitted.followUp({ content: `❌ **Failed**: ${result.error}`, flags: MessageFlags.Ephemeral });
                        }

                        const next = await renderDashboard(targetCardId);
                        await submitted.editReply({ content: `✅ Card renamed to **${newTitle}**!`, ...next });
                    } catch (e) {
                        logger.error('Modal submission error (rename):', e, 'Bingo');
                        // Modal was closed or timed out - this is expected behavior, no action needed
                    }
                }

                else if (i.customId === 'bingo_resize_modal') {
                    const card = await getBingoCardById(targetCardId);
                    const modal = new ModalBuilder()
                        .setCustomId('bingo_edit_resize_modal')
                        .setTitle('Resize Bingo Grid')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('grid_size')
                                    .setLabel('New Grid Size (2-5)')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(1)
                                    .setPlaceholder('Example: 4 for 4x4')
                                    .setValue(card.size.toString())
                            )
                        );
                    await i.showModal(modal);

                    try {
                        const submitted = await i.awaitModalSubmit({ time: 60000 });
                        await submitted.deferUpdate();

                        const newSize = parseInt(submitted.fields.getTextInputValue('grid_size'));
                        const result = await resizeBingoCard(targetCardId, newSize);

                        if (result.error) {
                            return await submitted.followUp({ content: `❌ **Resize Failed**: ${result.error}`, flags: MessageFlags.Ephemeral });
                        }

                        const next = await renderDashboard(targetCardId);
                        await submitted.editReply({ content: `✅ Grid resized to **${newSize}x${newSize}**!`, ...next });
                    } catch (e) {
                        logger.error('Modal submission error (resize):', e, 'Bingo');
                        // Modal was closed or timed out - this is expected behavior, no action needed
                    }
                }

                else if (i.customId === 'bingo_add_modal') {
                    const card = await getBingoCardById(targetCardId);
                    const isManga = card.mode === 'MANGA';
                    const modal = new ModalBuilder()
                        .setCustomId('bingo_edit_add_modal')
                        .setTitle(`Add ${isManga ? 'Manga' : 'Anime'} to Card`)
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('anime_query')
                                    .setLabel(`${isManga ? 'Manga' : 'Media'} Name or ID`)
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setPlaceholder(`Example: ${isManga ? 'Berserk' : 'Frieren'}`)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('slot_number')
                                    .setLabel('Specific Slot (1-25) - Optional')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(false)
                                    .setPlaceholder('Leave blank for first empty slot')
                            )
                        );
                    await i.showModal(modal);

                    try {
                        const submitted = await i.awaitModalSubmit({ time: 60000 });
                        await submitted.deferUpdate();

                        const query = submitted.fields.getTextInputValue('anime_query');
                        const slotInput = submitted.fields.getTextInputValue('slot_number');
                        const slotIdx = slotInput ? parseInt(slotInput) - 1 : null;

                        const queryVal = /^\d+$/.test(query) ? parseInt(query) : query;
                        const result = await addAnimeToBingo(targetCardId, queryVal, slotIdx);

                        const next = await renderDashboard(targetCardId);
                        if (result.error) {
                            return await submitted.editReply({ content: `❌ **Failed**: ${result.error}`, ...next });
                        }
                        await submitted.editReply({ content: `✅ Added **${result.media.title.english || result.media.title.romaji}**!`, ...next });
                    } catch (e) {
                        logger.error('Modal submission error (add anime):', e, 'Bingo');
                        // Modal was closed or timed out - this is expected behavior, no action needed
                    }
                }

                else if (i.customId === 'delete_bingo') {
                    const card = await getBingoCardById(targetCardId);
                    await deleteBingoCard(targetCardId);
                    await i.update({ content: `🗑️ **Deleted** bingo card: ${card?.title || 'Unknown'}.`, embeds: [], components: [] });
                    collector.stop();
                }
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });
        };

        // --- ADD ---
        if (subcommand === 'add') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const animeQuery = interaction.options.getString('anime');
            const slot = interaction.options.getInteger('slot');

            const targetCard = await resolveCardInteraction(interaction, "Which card should we add to?");
            if (!targetCard) return;

            try {
                const queryVal = /^\d+$/.test(animeQuery) ? parseInt(animeQuery) : animeQuery;
                const slotIndex = slot ? slot - 1 : null;

                const result = await addAnimeToBingo(targetCard.id, queryVal, slotIndex);

                const next = await renderDashboard(targetCard.id);
                if (result.error) {
                    return await interaction.editReply({ content: `❌ **Failed**: ${result.error}`, ...next });
                }

                const msg = await interaction.editReply({
                    content: `✅ Added **${result.media.title.english || result.media.title.romaji}** to **${targetCard.title}**!`,
                    ...next
                });
                startDashboardCollector(msg, targetCard.id);

            } catch (e) {
                logger.error('Error in bingo add command:', e, 'Bingo');
                await interaction.editReply({ content: '❌ An error occurred.', components: [] });
            }
        }

        // --- FETCH ---
        if (subcommand === 'fetch') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetCard = await resolveCardInteraction(interaction, "Which card should be synced with AniList?");
            if (!targetCard) return;

            const result = await fetchAndFillBingo(targetCard.id, interaction.user.id, interaction.guild.id);

            const next = await renderDashboard(targetCard.id);
            if (result.error) {
                return await interaction.editReply({ content: `❌ **Fetch Failed**: ${result.error}`, ...next });
            }

            const msg = await interaction.editReply({
                content: `✅ **Synced!** Added **${result.count}** titles from your Planning list to **${targetCard.title}**.`,
                ...next
            });
            startDashboardCollector(msg, targetCard.id);
        }

        // --- EDIT ---
        if (subcommand === 'edit') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetCard = await resolveCardInteraction(interaction, "Select the bingo card to manage:");
            if (!targetCard) return;

            const payload = await renderDashboard(targetCard.id);
            const msg = await interaction.editReply(payload);
            startDashboardCollector(msg, targetCard.id);
        }
    }
};
