const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildLobbyPayload(game) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Sanctuary Lobby')
        .setColor('#8B5CF6') 
        .setDescription(`**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Survivors:** ${game.players.size}/15 (Min: 4)`)
        .setThumbnail('https://i.imgur.com/vHqB7d1.png') 
        .setFooter({ text: 'The world is ending. The library must endure.', iconURL: null })
        .setTimestamp();

    let playersList = Array.from(game.players.values()).map(p => {
        return p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`;
    }).join('\n');
    
    if (playersList.length === 0) playersList = 'Waiting for players...';

    embed.addFields({ name: 'Players Joined', value: playersList });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_hub_${game.lobbyMessageId}`).setLabel('📖 Sanctuary Terminal').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_spectate_${game.lobbyMessageId}`).setLabel('👁️ Peer into Sanctuary').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildActionHub(game, user) {
    const isHost = user.id === game.hostId;
    const isPlayer = game.players.has(user.id);
    const options = [];

    if (!isPlayer) {
        options.push({ label: 'Join Sanctuary', value: 'join', description: 'Enter the safe-zone.', emoji: '📥' });
    } else {
        // Only show leave if NOT the host
        if (!isHost) {
            options.push({ label: 'Leave Sanctuary', value: 'leave', description: 'Venture into the wastes.', emoji: '📤' });
        }
    }

    if (isHost) {
        options.push({ label: 'Seal the Gates', value: 'start', description: 'Close the library and begin.', emoji: '▶️' });
        options.push({ label: 'Sanctuary Settings', value: 'settings', description: 'Adjust protocols.', emoji: '⚙️' });
        options.push({ label: 'Inject Test Bots', value: 'inject_bots', description: 'Add virtual test players.', emoji: '🧪' });
    }

    options.push({ label: 'Lore / Protocols', value: 'help', description: 'Learn the safety protocols.', emoji: '❓' });

    const dropdown = new StringSelectMenuBuilder()
        .setCustomId(`archive_lobby_${game.lobbyMessageId}`)
        .setPlaceholder('Available Actions...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(dropdown);
    
    return { content: `**Welcome to the Sanctuary Terminal, <@${user.id}>.**\nManage your status and protocols below.`, components: [row], flags: 64 };
}

function buildSettingsPayload(game) {
    const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Sanctuary Protocol Dashboard')
        .setColor('#3498db')
        .setDescription(`Configure your survival parameters securely below.\n\n**Protocol:** ${game.settings.gameMode}\n**Discussion Time:** ${game.settings.discussionTime}s\n**Voting Time:** ${game.settings.votingTime}s`);

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
        new ButtonBuilder().setCustomId(`archive_settimer_${game.lobbyMessageId}_disc`).setLabel('Cycle Discussion').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_settimer_${game.lobbyMessageId}_vote`).setLabel('Cycle Voting').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_lobby_back_${game.lobbyMessageId}`).setLabel('⬅️ Back to Lobby').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [modeRow, btnRow], flags: 64 };
}

function buildStartedLobbyPayload(game) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Locked Session')
        .setColor('#2ecc71')
        .setDescription(`**Status:** Lockdown Active\n**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Survivor Count:** ${game.getAlivePlayers().length}/${game.players.size}\n\nThe Gates are sealed, but you can still peer into the sanctuary or join the rescue queue.`)
        .setFooter({ text: 'Humanity\'s last hope is currently being written.' })
        .setTimestamp();
    
    if (game.waitlist.size > 0) {
        embed.addFields({ name: '📝 Rescue Queue', value: Array.from(game.waitlist).map(id => `<@${id}>`).join(', ') });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_spectate_${game.lobbyMessageId}`).setLabel('👁️ Peer into Sanctuary').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_queue_${game.lobbyMessageId}`).setLabel('⏳ Join Rescue Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_help_general_${game.lobbyMessageId}`).setLabel('💡 Sanctuary Protocols').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

module.exports = { buildLobbyPayload, buildSettingsPayload, buildStartedLobbyPayload, buildActionHub };
