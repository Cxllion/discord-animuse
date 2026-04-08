const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../generators/baseEmbed');
const CONFIG = require('../config');

function buildLobbyPayload(game) {
    const embed = baseEmbed('📚 The Final Library | Sanctuary Lobby', null, null)
        .setColor('#8B5CF6') 
        .setDescription(`**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Survivors:** ${game.players.size}/15 (Min: 4)`)
        .setFooter({ text: 'Protocol 1: Trust no one but the archives.' })
        .setTimestamp();

    let playersList = Array.from(game.players.values()).map(p => {
        let name = p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`;
        if (p.requiresConfirmation && !p.isConfirmed) name += ' (⏳)';
        return name;
    }).join('\n');
    
    if (playersList.length === 0) playersList = 'Waiting for players...';

    embed.addFields(
        { name: '👥 Joined Survivors', value: playersList },
        { name: '⏱️ Archival Protocols', value: `> **Discussion:** \`${game.settings.discussionTime}s\`\n> **Voting:** \`${game.settings.votingTime}s\`\n> **Night:** \`${game.settings.nightTime}s\`\n> **Prologue:** \`${game.settings.prologueTime}s\``, inline: false }
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_access_${game.hostId}`).setLabel('📋 Access').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mafia_help_general_${game.hostId}`).setLabel('❓ Guide').setStyle(ButtonStyle.Secondary)
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
        options.push({ label: 'Disband Sanctuary', value: 'disband', description: 'Permanently close this lobby and delete the record.', emoji: '🗑️' });
    }

    if (isPlayer && game.state !== 'LOBBY') {
        options.push({ label: 'Edit Last Will', value: 'last_will', description: 'Update your final message revealed on death.', emoji: '✍️' });
        options.push({ label: 'Roster Status', value: 'status', description: 'View alive/dead counts and survivor list.', emoji: '📊' });
    }

    if (isPlayer) {
        options.push({ label: 'Personal Records', value: 'personal_stats', description: 'View your survival statistics.', emoji: '🏅' });
    }

    const rows = [];
    const dropdown = new StringSelectMenuBuilder()
        .setCustomId(`mafia_lobby_${game.hostId}`)
        .setPlaceholder('📜 Select a Command...')
        .addOptions(options);

    rows.push(new ActionRowBuilder().addComponents(dropdown));

    if (!isHost) {
        const button = new ButtonBuilder();
        if (!isPlayer) {
            button.setCustomId(`mafia_join_${game.hostId}`)
                .setLabel('📥 Join Sanctuary')
                .setStyle(ButtonStyle.Primary);
        } else {
            button.setCustomId(`mafia_leave_${game.hostId}`)
                .setLabel('📤 Leave Sanctuary')
                .setStyle(ButtonStyle.Danger);
        }
        rows.push(new ActionRowBuilder().addComponents(button));
    }
    
    const embed = baseEmbed('🎧 Sanctuary Terminal', 
        `Connection established for <@${user.id}>.\nAuthorization: **${isHost ? 'Host' : (isPlayer ? 'Survivor' : 'Outsider')}**\n\nSelect a command below to interact with the sanctuary.`, 
        null
    )
        .setColor('#8B5CF6')
        .setFooter({ text: isHost ? 'You have full administrative control.' : 'Your actions shape the library\'s fate.' });

    return { 
        embeds: [embed],
        components: rows, 
        flags: 64 
    };
}

function buildSurvivalGuide(page = 'intro') {
    const embed = baseEmbed(null, null, null).setColor('#F59E0B');

    const menu = new StringSelectMenuBuilder()
        .setCustomId('mafia_help_menu')
        .setPlaceholder('Navigate Survival Guide...')
        .addOptions([
            { label: 'Rules & Phases', value: 'intro', emoji: '📖' },
            { label: 'Archivists (Town)', value: 'archivist', emoji: '🛡️' },
            { label: 'Revisions (Mafia)', value: 'revision', emoji: '🔪' },
            { label: 'Unbound (Neutral)', value: 'unbound', emoji: '🃏' },
            { label: 'Game Modes', value: 'modes', emoji: '🎴' }
        ]);
    
    menu.options.find(o => o.data.value === page).data.default = true;

    if (page === 'intro') {
        embed.setTitle('📖 Protocol Overview: Rules & Phases')
            .setDescription('The Final Library is humanity\'s last hope. You must use deduction to survive the Viral Rot.')
            .addFields(
                { name: '🎯 The Primary Directive', value: '**Archivists** (Town) must identify and redact all corrupted **Revisions** (Mafia).\n**Revisions** win when they achieve numerical parity with the Archivists.' },
                { name: '🌑 Night Cycle', value: 'The Sanctuary locks. If you hold a protocol role, you will receive a **Priority DM**. Choose your target carefully. Revisions coordinate their deletions in their private Hub.' },
                { name: '🌅 Morning Report', value: 'The **Archive Diagnostic** reveals who was erased and their Last Will. Open discussion begins to isolate suspects.' },
                { name: '⚖️ Council Voting', value: 'Ballots appear below the chat. Choices are confidential until the phase ends. A **Skip Vote** majority or a tie results in no erasure.' },
                { name: '✍️ Final Record (Last Will)', value: 'Draft your last message via `/mafia will`. Should your biometrics fail, your record is revealed to all survivors.' }
            );
    } else if (page === 'archivist') {
        embed.setTitle('🛡️ The Archivists (Town)')
            .setDescription('The loyal guardians of humanity\'s records. Their mission is to purge the corruption.')
            .addFields(
                { name: 'The Indexer `(Cop)`', value: 'Performs a biological scan to determine a player\'s true alignment.' },
                { name: 'The Conservator `(Doctor)`', value: 'Maintains a protective barrier over one survivor each night.' },
                { name: 'The Ghostwriter `(Vigilante)`', value: 'Authorized to execute suspects. If an innocent Archivist is erased, they will self-redact out of guilt.' },
                { name: 'The Scribe `(Tracker)`', value: 'Analyzes deceased remains to find one random visitor from the previous night. Bound by biometrics and cannot vote the suspect next day.' },
                { name: 'The Plurality `(Mayor)`', value: 'Their authority grants their vote double-weight during the Council phase.' }
            );
    } else if (page === 'revision') {
        embed.setTitle('🩸 The Revisions (Mafia)')
            .setDescription('The corrupted invaders. They have compromised the archives and work together to erase the rest.')
            .addFields(
                { name: 'The Shredder `(Goon)`', value: 'The primary deletion agent. Authorized to eliminate one Archivist each night.' },
                { name: 'The Censor `(Roleblocker)`', value: 'Imposes a mandatory quarantine on one survivor, preventing their night action from executing.' },
                { name: 'The Plagiarist `(Godfather)`', value: 'Appears as a clean Archivist during Indexer diagnostics.' }
            );
    } else if (page === 'unbound') {
        embed.setTitle('🃏 The Unbound (Neutral)')
            .setDescription('Irregular signatures with their own survival protocols. They play for their own victory.')
            .addFields(
                { name: 'The Anomaly `(Jester)`', value: 'Wins immediately if they successfully manipulate the sanctuary into exiling them.' },
                { name: 'The Critic `(Executioner)`', value: 'Holds a specific vendetta against one Archivist. Wins if that target is exiled by the council.' },
                { name: 'The Bookburner `(Arsonist)`', value: 'Saturates survivors with toxins over several nights, eventually igniting them all in a single sector breach.' }
            );
    } else if (page === 'modes') {
        embed.setTitle('🎴 Sanctuary Simulation Modes')
            .setDescription('Different protocols for different archival needs.')
            .addFields(
                { name: 'Classic Archive', value: 'A balanced, competitive simulation with standard roles: Indexer, Conservator, Shredder, and Archivists.' },
                { name: 'Unabridged Archive (Chaos)', value: 'Total chaos. Any role from the library (Ghostwriter, Censor, Bookburner, etc.) might be present in a random composition.' },
                { name: 'Ink Rot (Cult)', value: 'Features the dreaded **The Corruptor**, who can spread infection to honest Archivists, growing their faction night by night.' }
            );
    }

    embed.setFooter({ text: 'Protocol 1: Trust no one but the archives.' });

    const row = new ActionRowBuilder().addComponents(menu);
    return { embeds: [embed], components: [row], flags: 64 };
}

function buildSettingsPayload(game, category = 'discussion') {
    const embed = baseEmbed('⚙️ Sanctuary Protocol Dashboard', 
        `Configure the survival simulation parameters.\n\n` +
        `**Discussion:** \`${game.settings.discussionTime}s\` · **Voting:** \`${game.settings.votingTime}s\`\n` +
        `**Night:** \`${game.settings.nightTime}s\` · **Prologue:** \`${game.settings.prologueTime}s\`\n` +
        `**Mode:** ${game.settings.gameMode}\n` +
        `**Role Reveal on Death:** ${game.settings.revealRoles ? '✅ Enabled' : '❌ Hidden'}\n` +
        `**Voice Support:** ${game.settings.voiceSupport === 'new' ? '🎙️ New Hub' : (game.settings.voiceSupport === 'existing' ? '🎧 Existing Sector' : '❌ Disabled')}`,
        null
    ).setColor('#3498db');

    const modeRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mafia_setmode_${game.hostId}`)
            .setPlaceholder('Select Game Mode')
            .addOptions([
                { label: 'Classic Archive', description: 'Classic balanced gameplay.', value: 'Classic Archive' },
                { label: 'Unabridged Archive (Chaos)', description: 'All unique roles potentially active.', value: 'Chaos' },
                { label: 'Ink Rot', description: 'Cult mechanics.', value: 'Ink Rot' }
            ])
    );

    const categoryRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mafia_setphase_cat_${game.hostId}`)
            .setPlaceholder('Select Phase to Configure')
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
            .setCustomId(`mafia_setphase_val_${game.hostId}_${category}`)
            .setPlaceholder(`Set ${category.charAt(0).toUpperCase() + category.slice(1)} Duration`)
            .addOptions(durationOptions[category] || durationOptions.discussion)
    );

    let vcLabel = '🔇 VC: Disabled';
    if (game.settings.voiceSupport === 'new') vcLabel = '🎙️ VC: New Hub';
    else if (game.settings.voiceSupport === 'existing') vcLabel = '🎧 VC: Existing';

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_togglereveal_${game.hostId}`).setLabel(game.settings.revealRoles ? '👁️ Roles: Revealed' : '🔒 Roles: Hidden').setStyle(game.settings.revealRoles ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mafia_togglevc_${game.hostId}`).setLabel(vcLabel).setStyle(game.settings.voiceSupport !== 'disabled' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mafia_lobby_back_${game.hostId}`).setLabel('⬅️ Back').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [modeRow, categoryRow, durationRow, backRow], flags: 64 };
}

function buildStartedLobbyPayload(game) {
    const MafiaManager = require('./MafiaManager');
    const channelId = game.thread?.parentId || game.thread?.id;
    const queue = MafiaManager.globalQueues.get(channelId) || new Set();

    const embed = baseEmbed('📚 The Final Library | Session Active', 
        `**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Players:** ${game.players.size}\n\nThe gates are sealed. The survival simulation is underway.`, 
        null
    )
        .setColor('#2ecc71')
        .addFields(
            { name: '🎙️ Audio Status', value: '> **Library Hub:** `Operational`\n> **Uplink:** `Encrypted`' },
            { name: '🛡️ Sanctuary Integrity', value: game.isSecure ? '> **Mode:** `Secure Redaction` (Private)\n> **Protocol:** `Member Exile Active`' : '> **Mode:** `Public Records` (Vulnerable)\n> **Protocol:** `Partial Containment`' }
        )
        .setTimestamp();
    
    if (queue.size > 0) {
        embed.addFields({ name: '📝 Next Game Queue', value: Array.from(queue).map(id => `<@${id}>`).join(', ') });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_queuenext_${game.hostId}`).setLabel('⏳ Join Next Game').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mafia_help_general_${game.hostId}`).setLabel('📖 Survival Guide').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildEndedLobbyPayload(game, winner) {
    const embed = baseEmbed('📚 The Final Library | Session Concluded', 
        `**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n\n🏆 **Victor:** **${winner.toUpperCase()}**`, 
        null
    )
        .setColor(winner === 'Archivists' ? '#2ecc71' : (winner === 'Revisions' ? '#e74c3c' : '#f1c40f'))
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
    
    const embed = baseEmbed(`🌅 Morning Report — Night ${game.dayCount}`, null, null)
        .setColor(deaths.length > 0 ? '#e74c3c' : '#2ecc71')
        .setTimestamp();

    if (deaths.length === 0) {
        embed.setDescription('The Sanctuary was unusually quiet last night. No bio-signatures were redacted from the master record.');
    } else {
        embed.setDescription(`The Sanctuary's monitors flicker. **${deaths.length}** signature${deaths.length === 1 ? ' has' : 's have'} been erased from the roster.`);
        
        for (const d of deaths) {
            const roleStr = reveal
                ? (d.target.role ? `${d.target.role.emoji} **${d.target.role.name}** (${d.target.role.faction})` : '`Unknown`')
                : '🔒 **REDACTED**';
            
            const variantTitles = ["CRITICAL BREACH", "DATA ERASURE", "SYSTEM PURGE", "SECTOR FAILURE", "BIOMETRIC LOSS"];
            const fieldTitle = d.isGuilt ? '💔 GUILT OVERRIDE' : `💀 ${variantTitles[Math.floor(Math.random() * variantTitles.length)]}`;
            
            let reportStr = d.isGuilt
                ? `**${d.target.name}** could not stand the weight of erasing an innocent survivor. Their mind has been rewritten out of guilt.\n**Role:** ${roleStr}`
                : `**${d.target.name}** has been unceremoniously erased from the library.\n**Role:** ${roleStr}`;
            
            if (d.target.lastWill) {
                reportStr += `\n\n📜 **Last Will:**\n> *"${d.target.lastWill}"*`;
            } else {
                reportStr += `\n\n📜 *No Last Will was found.*`;
            }
            
            embed.addFields({ name: fieldTitle, value: reportStr });
        }
    }

    const alive = Array.from(game.players.values()).filter(p => p.alive);
    const dead = Array.from(game.players.values()).filter(p => !p.alive);
    
    embed.addFields(
        { name: `🧍 Survivors (${alive.length})`, value: alive.length > 0 ? alive.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None' },
        { name: `💀 Redacted (${dead.length})`, value: dead.length > 0 ? dead.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None' }
    );

    return { embeds: [embed] };
}

function buildGameOverPayload(game, winner) {
    const embed = baseEmbed('📚 The Final Library | Sanctuary Debrief', 
        `**Simulation Terminated.**\n\n**Victor:** ${winner.toUpperCase()}`, 
        null
    )
        .setColor(winner === 'Archivists' ? '#2ecc71' : (winner === 'Revisions' ? '#e74c3c' : '#f1c40f'))
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
    
    const embed = baseEmbed(`${p.role.emoji} Your Role: ${p.role.name.toUpperCase()}`, 
        `*${p.role.description}*`, 
        null
    )
        .setColor(color)
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

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    if (p.role.priority !== 99) {
        embed.addFields({ name: '⚡ Protocol Level', value: `Level **${p.role.priority}** Clearance. You hold a mandatory Night Action.` });
    } else {
        embed.addFields({ name: '💤 Protocol Level', value: 'Level **99** Clearance. No active night action authorized.' });
    }

    embed.addFields({ name: '🎙️ Audio Access', value: `You are authorized for the **Library Hub** voice frequency. Coordinate with your fellow survivors in real-time.` });

    return { embeds: [embed] };
}

function buildMafiaProfile(user, stats) {
    const embed = baseEmbed('🏅 Sanctuary Protocol Records', null, null)
        .setColor('#9b59b6')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
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

function buildStagnationPayload(game) {
    const embed = baseEmbed('⚠️ Sanctuary Protocol Warning', 
        `Your lobby in <#${game.channelId}> has been inactive for over 10 minutes.\n\nTo preserve archives and maintain focus, inactive lobbies must be confirmed. Please select an action below. If no action is taken within 2 minutes, the sanctuary will be automatically disbanded.`, 
        null
    )
        .setColor('#e67e22')
        .addFields(
            { name: 'Current Status', value: `Players: **${game.players.size}**\nMode: **${game.settings.gameMode}**` }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafia_stagnation_keep_${game.hostId}`)
            .setLabel('⏳ Keep Waiting')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`mafia_stagnation_disband_${game.hostId}`)
            .setLabel('🗑️ Disband Now')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

module.exports = { 
    baseEmbed,
    buildLobbyPayload, 
    buildSettingsPayload, 
    buildStartedLobbyPayload, 
    buildActionHub, 
    buildSurvivalGuide,
    buildMorningReport,
    buildGameOverPayload,
    buildRoleCard,
    buildMafiaProfile,
    buildEndedLobbyPayload,
    buildStagnationPayload
};
