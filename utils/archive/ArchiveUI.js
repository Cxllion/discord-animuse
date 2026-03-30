const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildLobbyPayload(game) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Sanctuary Lobby')
        .setColor('#8B5CF6') 
        .setDescription(`**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Survivors:** ${game.players.size}/15 (Min: 4)`)
        .setFooter({ text: 'The world is ending. The library must endure.' })
        .setTimestamp();

    let playersList = Array.from(game.players.values()).map(p => {
        let name = p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`;
        if (p.requiresConfirmation && !p.isConfirmed) name += ' (⏳)';
        return name;
    }).join('\n');
    
    if (playersList.length === 0) playersList = 'Waiting for players...';

    embed.addFields({ name: 'Players Joined', value: playersList });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_access_${game.lobbyMessageId}`).setLabel('📖 Access Terminal').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_help_general_${game.lobbyMessageId}`).setLabel('❓ Survival Guide').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildActionHub(game, user) {
    const isHost = user.id === game.hostId;
    const isPlayer = game.players.has(user.id);
    const options = [];

    if (!isPlayer) {
        options.push({ label: 'Join Sanctuary', value: 'join', description: 'Enter the safe-zone and register your biometrics.', emoji: '📥' });
    } else if (!isHost) {
        options.push({ label: 'Leave Sanctuary', value: 'leave', description: 'Venture into the wastes.', emoji: '📤' });
    }

    if (isHost) {
        options.push({ label: 'Seal the Gates', value: 'start', description: 'Close the library and begin the survival simulation.', emoji: '▶️' });
        options.push({ label: 'Sanctuary Settings', value: 'settings', description: 'Adjust protocol timers and modes.', emoji: '⚙️' });
        options.push({ label: 'Inject Test Bots', value: 'inject_bots', description: 'Add virtual test survivors for simulation.', emoji: '🧪' });
    }

    if (isPlayer) {
        options.push({ label: 'Archive Status', value: 'status', description: 'Check player health and records.', emoji: '📊' });
    }

    const dropdown = new StringSelectMenuBuilder()
        .setCustomId(`archive_lobby_${game.lobbyMessageId}`)
        .setPlaceholder('📜 Select a Command...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(dropdown);
    
    return { 
        content: `🎧 **Sanctuary Terminal Link Established: <@${user.id}>**\nYour current authorization level allows the following maneuvers:`, 
        components: [row], 
        flags: 64 
    };
}

function buildSurvivalGuide() {
    const embed = new EmbedBuilder()
        .setTitle('❓ The Archivist’s Guide to Survival')
        .setColor('#F59E0B')
        .setDescription('New to the Final Library? Here is how to keep humanity’s memory alive (or erase it).')
        .addFields(
            { name: '📜 The Objective', value: 'The world is ending. A virus (The Viral Rot) is erasing our archives. **Archivists** win if they exile all infected. **Revisions** win if they compromise enough survivors.' },
            { name: '🌑 Phase: Night', value: 'Everyone receives a private DM. Survivors use their special abilities (Protect, Investigate, etc.) while the Infected coordinate their strike in a secret thread.' },
            { name: '🌅 Phase: Day', value: 'Morning reports reveal who was erased. Survivors discuss evidence and vote to **Exile** a suspect.' },
            { name: '✍️ The Last Will', value: 'Write your final message in your Night DMs. If you die, it will be revealed to everyone. Use it to share clues!' }
        )
        .setFooter({ text: 'Protocol 1: Trust no one but the archives.' });

    return { embeds: [embed], flags: 64 };
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
    const gameManager = require('./ArchiveManager');
    const channelId = game.thread?.parentId || game.thread?.id;
    const queue = gameManager.globalQueues.get(channelId) || new Set();

    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Locked Session')
        .setColor('#2ecc71')
        .setDescription(`**Status:** Lockdown Active\n**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Survivor Count:** ${game.getAlivePlayers().length}/${game.players.size}\n\nThe Gates are sealed, but you can join the queue for the next rescue mission.`)
        .setFooter({ text: 'Humanity\'s last hope is currently being written.' })
        .setTimestamp();
    
    if (queue.size > 0) {
        embed.addFields({ name: '📝 Next Game Queue', value: Array.from(queue).map(id => `<@${id}>`).join(', ') });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_queuenext_${game.lobbyMessageId}`).setLabel('⏳ Join Next Game').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_help_general_${game.lobbyMessageId}`).setLabel('💡 Sanctuary Protocols').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

module.exports = { buildLobbyPayload, buildSettingsPayload, buildStartedLobbyPayload, buildActionHub };
