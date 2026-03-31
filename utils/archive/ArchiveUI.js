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

    embed.addFields(
        { name: '👥 Players Joined', value: playersList },
        { name: '⏱️ Phase Timers', value: `Discussion: \`${game.settings.discussionTime}s\` · Voting: \`${game.settings.votingTime}s\` · Night: \`${game.settings.nightTime}s\` · Prologue: \`${game.settings.prologueTime}s\``, inline: false }
    );

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
        options.push({ label: 'Edit Last Will', value: 'last_will', description: 'Update your final message revealed on death.', emoji: '✍️' });
        options.push({ label: 'Roster Status', value: 'status', description: 'View alive/dead counts and survivor list.', emoji: '📊' });
        options.push({ label: 'Personal Records', value: 'personal_stats', description: 'View your survival statistics.', emoji: '🏅' });
    }

    const dropdown = new StringSelectMenuBuilder()
        .setCustomId(`archive_lobby_${game.lobbyMessageId}`)
        .setPlaceholder('📜 Select a Command...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(dropdown);
    
    const embed = new EmbedBuilder()
        .setTitle('🎧 Sanctuary Terminal')
        .setColor('#8B5CF6')
        .setDescription(`Connection established for <@${user.id}>.\nAuthorization: **${isHost ? 'Host' : (isPlayer ? 'Survivor' : 'Outsider')}**\n\nSelect a command below to interact with the sanctuary.`)
        .setFooter({ text: isHost ? 'You have full administrative control.' : 'Your actions shape the library\'s fate.' });

    return { 
        embeds: [embed],
        components: [row], 
        flags: 64 
    };
}

function buildSurvivalGuide(page = 'intro') {
    const embed = new EmbedBuilder().setColor('#F59E0B');

    const menu = new StringSelectMenuBuilder()
        .setCustomId('archive_help_menu')
        .setPlaceholder('Navigate Survival Guide...')
        .addOptions([
            { label: 'Rules & Phases', value: 'intro', emoji: '📖' },
            { label: 'Archivists (Town)', value: 'archivist', emoji: '🛡️' },
            { label: 'Revisions (Mafia)', value: 'revision', emoji: '🔪' },
            { label: 'Unbound (Neutral)', value: 'unbound', emoji: '🃏' }
        ]);
    
    // Default setting for current page
    menu.options.find(o => o.data.value === page).data.default = true;

    if (page === 'intro') {
        embed.setTitle('📖 The Archivist\'s Guide: Rules & Phases')
            .setDescription('The Final Library is humanity\'s last hope. You must use deduction to survive.')
            .addFields(
                { name: '🎯 The Core Objective', value: '**Archivists** (Town) must identify and exile all infected **Revisions** (Mafia).\n**Revisions** win when they equal or outnumber the Archivists.' },
                { name: '🌑 Night Phase', value: 'The thread locks. If you have an ability, you will receive a **DM with a dropdown**. Choose your target. Revisions secretly coordinate their kill in their private thread.' },
                { name: '🌅 Day Phase', value: 'The **Morning Report** reveals who died and their Last Will. Open discussion begins to find suspects.' },
                { name: '⚖️ Voting Phase', value: 'Vote buttons appear below the chat. You can change your vote, but only your final choice counts. A **Skip Vote** majority or a tie results in no exile.' },
                { name: '✍️ Last Will', value: 'Write a message via the Night DM or `/mafia will`. If you die, it is publicly revealed in the morning.' }
            );
    } else if (page === 'archivist') {
        embed.setTitle('🛡️ The Archivists (Town)')
            .setDescription('The innocent defenders of the library. Their goal is to exile all Revisions.')
            .addFields(
                { name: 'The Indexer [Cop]', value: 'Scans one player each night to learn if their faction is Archivist or Revision.' },
                { name: 'The Conservator [Doctor]', value: 'Selects one player each night to protect them from being killed.' },
                { name: 'The Ghostwriter [Vigilante]', value: 'Can kill a player at night. However, if they kill an innocent Archivist, they will die of guilt the next night.' },
                { name: 'The Scribe [Tracker/Investigator]', value: 'Checks a dead body to see who visited them the previous night. Becomes "Ink-Bound" and cannot vote against the suspect the following day.' },
                { name: 'The Plurality [Mayor]', value: 'Their vote counts as two during the daytime Voting Phase.' }
            );
    } else if (page === 'revision') {
        embed.setTitle('🔪 The Revisions (Mafia)')
            .setDescription('The corrupted invaders. They know each other and secretly coordinate to take over.')
            .addFields(
                { name: 'The Shredder [Mafia Goon/Killer]', value: 'The designated killer of the faction. Wakes up to eliminate one Archivist each night.' },
                { name: 'The Censor [Roleblocker]', value: 'Selects one player each night. That player is blocked from using their ability for the night.' },
                { name: 'The Plagiarist [Godfather]', value: 'Appears as an innocent Archivist if scanned by The Indexer [Cop].' }
            );
    } else if (page === 'unbound') {
        embed.setTitle('🃏 The Unbound (Neutral)')
            .setDescription('Wildcards with their own solo win conditions. They win independently.')
            .addFields(
                { name: 'The Anomaly [Jester]', value: 'Wins the game immediately if they can trick the Town into voting them out during the day.' },
                { name: 'The Critic [Executioner]', value: 'Assigned a random Archivist as their target at the start. Wins if they can get that specific target voted out during the day.' },
                { name: 'The Bookburner [Arsonist]', value: 'Secretly douses one player each night. Can choose to ignite all doused players at once on a later night.' }
            );
    }

    embed.setFooter({ text: 'Protocol 1: Trust no one but the archives.' });

    const row = new ActionRowBuilder().addComponents(menu);
    return { embeds: [embed], components: [row], flags: 64 };
}

function buildSettingsPayload(game, category = 'discussion') {
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Sanctuary Protocol Dashboard')
        .setColor('#3498db')
        .setDescription(
            `Configure the survival simulation parameters.\n\n` +
            `**Discussion:** \`${game.settings.discussionTime}s\` · **Voting:** \`${game.settings.votingTime}s\`\n` +
            `**Night:** \`${game.settings.nightTime}s\` · **Prologue:** \`${game.settings.prologueTime}s\`\n` +
            `**Mode:** ${game.settings.gameMode}\n` +
            `**Role Reveal on Death:** ${game.settings.revealRoles ? '✅ Enabled' : '❌ Hidden'}`
        );

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

    const categoryRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`archive_setphase_cat_${game.lobbyMessageId}`)
            .setPlaceholder('🕑 Step 1: Select Phase to Configure')
            .addOptions([
                { label: 'Discussion Phase', value: 'discussion', emoji: '🗣️', default: category === 'discussion' },
                { label: 'Voting Phase', value: 'voting', emoji: '⚖️', default: category === 'voting' },
                { label: 'Night Resolution', value: 'night', emoji: '🌑', default: category === 'night' },
                { label: 'Prologue Cycle', value: 'prologue', emoji: '⏳', default: category === 'prologue' }
            ])
    );

    const durationOptions = {
        discussion: [
            { label: 'Instant (10s)', value: '10' },
            { label: 'Blitz (30s)', value: '30' },
            { label: 'Swift (60s)', value: '60' },
            { label: 'Standard (120s)', value: '120' },
            { label: 'Extended (180s)', value: '180' }
        ],
        voting: [
            { label: 'Instant (10s)', value: '10' },
            { label: 'Rapid (30s)', value: '30' },
            { label: 'Standard (60s)', value: '60' },
            { label: 'Slow (90s)', value: '90' },
            { label: 'Deliberate (120s)', value: '120' }
        ],
        night: [
            { label: 'Instant (10s)', value: '10' },
            { label: 'Blitz (30s)', value: '30' },
            { label: 'Standard (60s)', value: '60' },
            { label: 'Ponderous (90s)', value: '90' }
        ],
        prologue: [
            { label: 'Instant (5s)', value: '5' },
            { label: 'Swift (10s)', value: '10' },
            { label: 'Standard (15s)', value: '15' },
            { label: 'Paced (30s)', value: '30' }
        ]
    };

    const durationRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`archive_setphase_val_${game.lobbyMessageId}_${category}`)
            .setPlaceholder(`⏳ Step 2: Set ${category.charAt(0).toUpperCase() + category.slice(1)} Duration`)
            .addOptions(durationOptions[category] || durationOptions.discussion)
    );

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_togglereveal_${game.lobbyMessageId}`).setLabel(game.settings.revealRoles ? '👁️ Roles: Revealed on Death' : '🔒 Roles: Hidden Until Game Over').setStyle(game.settings.revealRoles ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`archive_lobby_back_${game.lobbyMessageId}`).setLabel('⬅️ Back to Lobby').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [modeRow, categoryRow, durationRow, backRow], flags: 64 };
}

function buildStartedLobbyPayload(game) {
    const gameManager = require('./ArchiveManager');
    const channelId = game.thread?.parentId || game.thread?.id;
    const queue = gameManager.globalQueues.get(channelId) || new Set();

    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Session Active')
        .setColor('#2ecc71')
        .setDescription(`**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Players:** ${game.players.size}\n\nThe gates are sealed. The survival simulation is underway.`)
        .setFooter({ text: 'Humanity\'s last hope is currently being written.' })
        .setTimestamp();
    
    if (queue.size > 0) {
        embed.addFields({ name: '📝 Next Game Queue', value: Array.from(queue).map(id => `<@${id}>`).join(', ') });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`archive_queuenext_${game.lobbyMessageId}`).setLabel('⏳ Join Next Game').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`archive_help_general_${game.lobbyMessageId}`).setLabel('📖 Survival Guide').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildEndedLobbyPayload(game, winner) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Session Concluded')
        .setColor(winner === 'Archivists' ? '#2ecc71' : (winner === 'Revisions' ? '#e74c3c' : '#f1c40f'))
        .setDescription(`**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n\n🏆 **Victor:** **${winner.toUpperCase()}**`)
        .setFooter({ text: 'The history of this sanctuary has been written.' })
        .setTimestamp();
    
    const alive = Array.from(game.players.values()).filter(p => p.alive);
    const dead = Array.from(game.players.values()).filter(p => !p.alive);
    
    embed.addFields(
        { name: `🧍 Survivors (${alive.length})`, value: alive.length > 0 ? alive.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None' },
        { name: `💀 Casualties (${dead.length})`, value: dead.length > 0 ? dead.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None' }
    );

    return { embeds: [embed], components: [] };
}

function buildMorningReport(game, deaths) {
    const reveal = game.settings.revealRoles;
    
    const embed = new EmbedBuilder()
        .setTitle(`🌅 Morning Report — Night ${game.dayCount}`)
        .setColor(deaths.length > 0 ? '#e74c3c' : '#2ecc71')
        .setTimestamp();

    if (deaths.length === 0) {
        embed.setDescription('The library was unusually quiet. No bio-signatures were erased from the master record.');
    } else {
        embed.setDescription(`The sanctuary's monitors flicker. ${deaths.length === 1 ? 'One survivor has' : `${deaths.length} survivors have`} been erased.`);
        
        for (const d of deaths) {
            const roleStr = reveal
                ? (d.target.role ? `${d.target.role.emoji} **${d.target.role.name}** (${d.target.role.faction})` : '`Unknown`')
                : '🔒 **Classified**';
            const fieldTitle = d.isGuilt ? '💔 Guilt Consumes' : '💀 Data Erasure';
            let reportStr = d.isGuilt
                ? `**${d.target.name}** could not bear the guilt of erasing an innocent Archivist. They have taken their own life.\n**Role:** ${roleStr}`
                : `**${d.target.name}** has been erased.\n**Role:** ${roleStr}`;
            
            if (d.target.lastWill) {
                reportStr += `\n\n📜 **Last Will:**\n> *"${d.target.lastWill}"*`;
            } else {
                reportStr += `\n\n📜 *No Last Will was found.*`;
            }
            
            embed.addFields({ name: fieldTitle, value: reportStr });
        }
    }

    return { embeds: [embed] };
}

function buildGameOverPayload(game, winner) {
    const embed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Sanctuary Debrief')
        .setColor(winner === 'Archivists' ? '#2ecc71' : (winner === 'Revisions' ? '#e74c3c' : '#f1c40f'))
        .setDescription(`**Simulation Terminated.**\n\n**Victor:** ${winner.toUpperCase()}`)
        .setTimestamp();

    const playersList = Array.from(game.players.values()).map(p => {
        const roleStr = p.role ? `${p.role.emoji} ${p.role.name}` : 'Unknown';
        const status = p.alive ? '🟢' : '💀';
        return `${status} <@${p.id}> — **${roleStr}**`;
    }).join('\n');

    embed.addFields({ name: '👥 Final Records', value: playersList || 'No records available.' });

    const timeline = Array.from(game.players.values())
        .filter(p => !p.alive)
        .sort((a, b) => (a.deathDay || 0) - (b.deathDay || 0))
        .map(p => `Day ${p.deathDay || '?'}: **${p.name}** (${p.role?.name || 'Unknown'})`)
        .join('\n');

    if (timeline) {
        embed.addFields({ name: '⏳ Redaction Timeline', value: timeline });
    }

    return { embeds: [embed] };
}

function buildRoleCard(p, game) {
    const isRevision = p.role.faction === 'Revisions';
    const isUnbound = p.role.faction === 'Unbound';
    
    let color = '#3498db';
    if (isRevision) color = '#e74c3c';
    if (isUnbound) color = '#f1c40f';
    
    const embed = new EmbedBuilder()
        .setTitle(`${p.role.emoji} Your Role: ${p.role.name.toUpperCase()}`)
        .setColor(color)
        .setDescription(`*${p.role.description}*`)
        .setThumbnail(`https://raw.githubusercontent.com/Cxllion/animuse-assets/main/roles/${p.role.name.toLowerCase().replace(/\s+/g, '_')}.png`)
        .setTimestamp();

    if (isRevision) {
        embed.addFields({ name: '🩸 Objective', value: 'Compromise the sanctuary. Eliminate or outnumber the Archivists to infect the database.' });
        const teammates = Array.from(game.players.values()).filter(t => t.id !== p.id && t.role?.faction === 'Revisions');
        if (teammates.length > 0) {
            embed.addFields({ name: '🤝 Your Team', value: teammates.map(t => `• **${t.name}** (${t.role.name})`).join('\n') });
        }
    } else if (isUnbound) {
        embed.addFields({ name: '🃏 Objective', value: 'You play by your own rules. Check your role description for your unique win condition.' });
    } else {
        embed.addFields({ name: '🛡️ Objective', value: 'Preserve the records. Identify and exile the infected Revisions before humanity\'s last archive is erased.' });
    }

    if (p.role.name === 'The Critic') {
        const tgt = game.players.get(p.criticTarget);
        embed.addFields({ name: '🎯 Your Target', value: `You win if the town exiles **${tgt?.name || 'Unknown'}**. Manipulate the discussion subtly.` });
    }

    if (p.role.priority !== 99) {
        embed.addFields({ name: '⚡ Night Ability', value: 'You will receive a DM each night with a target dropdown. Select your target before the timer expires.' });
    } else {
        embed.addFields({ name: '💤 Night Ability', value: 'You have no active night ability. Your power lies in your vote and your voice during the day.' });
    }

    return { embeds: [embed] };
}

function buildArchiveProfile(user, stats) {
    const embed = new EmbedBuilder()
        .setTitle('🏅 Sanctuary Protocol Records')
        .setColor('#9b59b6')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Biometric records retrieved.' })
        .setTimestamp();

    if (!stats) {
        embed.setDescription(`**Subject:** <@${user.id}>\n\nNo records found. You have not completed a survival simulation yet.`);
    } else {
        const winRate = stats.games_played > 0 ? (stats.wins / stats.games_played * 100).toFixed(1) : 0;
        
        let title = 'Rookie Survivor';
        if (stats.games_played >= 10 && winRate > 50) title = 'Veteran Archivist';
        if (stats.wins >= 20) title = 'Sanctuary Legend';
        if (stats.losses > 15 && winRate < 30) title = 'Tragic Casualty';

        embed.setDescription(`**Subject:** <@${user.id}>\n**Clearance:** \`${title}\``)
            .addFields(
                { name: '📊 Simulation Stats', value: `Total Sims: **${stats.games_played}**\nVictories: **${stats.wins}**\nErasures (Losses): **${stats.losses}**\nSurvivability: **${winRate}%**` }
            );
    }

    return { embeds: [embed], flags: 64 };
}

module.exports = { 
    buildLobbyPayload, 
    buildSettingsPayload, 
    buildStartedLobbyPayload, 
    buildActionHub, 
    buildSurvivalGuide,
    buildMorningReport,
    buildGameOverPayload,
    buildRoleCard,
    buildArchiveProfile,
    buildEndedLobbyPayload
};
