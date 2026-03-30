const {
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

const {
    getBingoCards,
    getBingoCardById,
} = require('../../utils/services/bingoService');

const { 
    getPlanningList 
} = require('../../utils/services/anilistService');

const { 
    getLinkedAnilist 
} = require('../../utils/core/database');

const { 
    renderBingoDashboard, 
    getBingoWizardPayload,
    resolveCardInteraction 
} = require('../../utils/handlers/bingoHandlers');

const LoadingManager = require('../../utils/ui/LoadingManager');
const logger = require('../../utils/core/logger');

module.exports = {
    cooldown: 15,
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
        .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add anime/manga to a bingo card')
                .addStringOption(opt => opt.setName('anime').setDescription('Anime/Manga to add').setAutocomplete(true).setRequired(false))
                .addStringOption(opt => opt.setName('card').setDescription('Bingo card to add to').setAutocomplete(true).setRequired(false))
                .addIntegerOption(opt => opt.setName('slot').setDescription('Slot number (1-25)').setMinValue(1).setMaxValue(25).setRequired(false))
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
        // Autocomplete logic stays here for now as it's command-specific
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'anime') {
            const query = focusedOption.value;
            if (!query) return await interaction.respond([]);
            const { searchMedia } = require('../../utils/services/anilistService');
            try {
                const results = await searchMedia(query);
                await interaction.respond(
                    results.slice(0, 25).map(m => ({
                        name: `[${m.format || '?'}] ${(m.title.english || m.title.romaji).substring(0, 90)}`,
                        value: m.id.toString()
                    }))
                );
            } catch (e) { try { await interaction.respond([]); } catch (err) { } }
        } else if (focusedOption.name === 'card') {
            const userId = interaction.user.id;
            const cards = await getBingoCards(userId, interaction.guild.id);
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
        if (interaction.client.isOfflineMode) {
            return await interaction.reply({
                content: '⚠️ **The Archives are currently sealed.** (Database Offline)\nBingo cards cannot be managed at this time.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const payload = getBingoWizardPayload(interaction.user.id, 'MODE');
            return await interaction.editReply(payload);
        }

        if (subcommand === 'view') {
            await interaction.deferReply();
            const loader = new LoadingManager(interaction);
            loader.startProgress('Sketching Bingo Card...', 8);
            
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const cardIdStr = interaction.options.getString('card');

            const cards = await getBingoCards(targetUser.id, interaction.guild.id);
            if (!cards || cards.length === 0) {
                return await loader.stop({ content: `📂 **${targetUser.username}** has no bingo cards yet.` });
            }

            let card;
            if (cardIdStr) {
                card = await getBingoCardById(cardIdStr);
                if (!card) card = cards.find(c => c.title.toLowerCase() === cardIdStr.toLowerCase());
            } else {
                card = cards[0];
            }

            if (!card) return await loader.stop({ content: '❌ Card not found.' });

            const payload = await renderBingoDashboard(interaction, card.id, targetUser.id);
            await loader.stop(payload);
        }

        if (subcommand === 'edit' || subcommand === 'add' || subcommand === 'fetch') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetCard = await resolveCardInteraction(interaction, "Select the bingo card to manage:");
            if (!targetCard) return;

            const payload = await renderBingoDashboard(interaction, targetCard.id, interaction.user.id);
            await interaction.editReply(payload);
        }
    }
};
