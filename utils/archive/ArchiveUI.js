const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildLobbyPayload(game) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Akashic Archive | Lobby')
        .setColor('#8B5CF6') // Premium purple aesthetic
        .setDescription(`**Host:** <@${game.hostId}>\n**Game Mode:** ${game.settings.gameMode}\n**Players:** ${game.players.size}/15 (Min: 4)`)
        .setThumbnail('https://i.imgur.com/vHqB7d1.png') // Arbitrary clean book icon
        .setFooter({ text: 'Powered by AniMuse', iconURL: null })
        .setTimestamp();

    let playersList = Array.from(game.players.values()).map(p => {
        return p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`;
    }).join('\n');
    
    if (playersList.length === 0) playersList = 'Waiting for players...';

    embed.addFields({ name: 'Players Joined', value: playersList });

    const dropdown = new StringSelectMenuBuilder()
        .setCustomId(`archive_lobby_${game.lobbyMessageId}`)
        .setPlaceholder('Lobby Actions...')
        .addOptions([
            { label: 'Join Game', value: 'join', description: 'Join the current lobby.', emoji: '📥' },
            { label: 'Leave Game', value: 'leave', description: 'Leave the current lobby.', emoji: '📤' },
            { label: 'Start Game', value: 'start', description: '(Host Only) Lock the lobby and begin.', emoji: '▶️' },
            { label: 'Inject Test Bots', value: 'inject_bots', description: '(Admin Only) Add virtual test players.', emoji: '🧪' },
            { label: 'Settings', value: 'settings', description: '(Host Only) Adjust game rules.', emoji: '⚙️' },
            { label: 'Edit Last Will', value: 'last_will', description: 'Change your final message.', emoji: '✍️' },
            { label: 'Help / Roles', value: 'help', description: 'Learn how to play.', emoji: '❓' }
        ]);

    const row = new ActionRowBuilder().addComponents(dropdown);

    return { embeds: [embed], components: [row] };
}

function buildSettingsPayload(game) {
    const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Game Settings Dashboard')
        .setColor('#3498db')
        .setDescription(`Configure your lobby parameters securely below.\n\n**Mode:** ${game.settings.gameMode}\n**Discussion Time:** ${game.settings.discussionTime}s\n**Voting Time:** ${game.settings.votingTime}s`);

    const modeRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`archive_setmode_${game.lobbyMessageId}`)
            .setPlaceholder('Select Game Mode')
            .addOptions([
                { label: 'First Edition', description: 'Classic balanced gameplay.', value: 'First Edition' },
                { label: 'Unabridged Archive (Chaos)', description: 'All unique roles potentially active.', value: 'Chaos' },
                { label: 'Ink Rot', description: 'Cult mechanics.', value: 'Ink Rot' }
            ])
    );

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_settimer_${game.lobbyMessageId}_disc`).setLabel('Cycle Discussion Time').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_settimer_${game.lobbyMessageId}_vote`).setLabel('Cycle Voting Time').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_settimer_modal_${game.lobbyMessageId}`).setLabel('Custom Timings').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [modeRow, btnRow], flags: 64 };
}

module.exports = { buildLobbyPayload, buildSettingsPayload };
