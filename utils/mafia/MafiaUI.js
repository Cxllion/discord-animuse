const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../generators/baseEmbed');
const CONFIG = require('../config');
const Lore = require('./MafiaLore');

function buildLobbyPayload(game) {
    const embed = baseEmbed('📚 The Final Library | Sanctuary Lobby', null, null)
        .setColor(Lore.COLORS.LOBBY) 
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

    if (isPlayer && game.state !== 'LOBBY' && game.players.get(user.id)?.alive) {
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
                { name: 'The Shredder `(Henchman)`', value: 'The primary deletion agent. Authorized to eliminate one Archivist each night.' },
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

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_save_prefs_${game.hostId}`).setLabel('💾 Save as My Default').setStyle(ButtonStyle.Secondary)
    );

    return { 
        content: '⚙️ **Sanctuary Configuration Control**\n*Adjust the parameters of the simulation below. Changes are applied instantly.*',
        embeds: [embed], 
        components: [modeRow, categoryRow, durationRow, backRow, row2],
        flags: 64
    };
}

function buildSpectatePayload(game) {
    const MafiaManager = require('./MafiaManager');
    const channelId = game.channelId;
    const queue = MafiaManager.globalQueues.get(channelId) || new Set();

    const embed = baseEmbed('📚 The Final Library | Session Active', 
        `**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n**Players:** ${game.players.size}/15\n\nThe gates are sealed. The archives are in a state of high-alert.`, 
        null
    )
        .setColor(Lore.COLORS.DAY)
        .addFields(
            { name: '🎙️ Audio Status', value: '> **Library Hub:** `Operational` (Restricted)\n> **Uplink:** `Encrypted`' },
            { name: '🛡️ Sanctuary Integrity', value: game.isSecure ? '> **Mode:** `Secure Redaction` (Private)\n> **Protocol:** `Member Exile Active`' : '> **Mode:** `Public Records` (Vulnerable)\n> **Protocol:** `Partial Containment`' }
        )
        .setTimestamp();
    
    if (queue.size > 0) {
        embed.addFields({ name: '📝 Next Game Queue', value: Array.from(queue).map(id => `<@${id}>`).join(', ') });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_spectate_${game.hostId}`).setLabel('👁️ Spectate').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mafia_queuenext_${game.hostId}`).setLabel('⏳ Join Queue').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mafia_help_general_${game.hostId}`).setLabel('❓ Guide').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildEndedLobbyPayload(game, winner) {
    const embed = baseEmbed('🏆 The Final Library | Session Concluded', 
        `**Host:** <@${game.hostId}>\n**Mode:** ${game.settings.gameMode}\n\n**Victor:** **${winner.toUpperCase()}**`, 
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

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafia_play_again_${game.hostId}`)
            .setLabel('♻️ Play Again')
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}

async function buildMorningReport(game, allDeaths) {
    const reveal = game.settings.revealRoles;
    const embed = baseEmbed(`🌅 Morning Report — Night ${game.dayCount}`, null, null)
        .setColor(allDeaths.length > 0 ? Lore.COLORS.VOTING : Lore.COLORS.DAY)
        .setImage(Lore.BANNERS.DAY)
        .setTimestamp();

    if (allDeaths.length === 0) {
        const lore = Lore.STORY.MORNING_QUIET[Math.floor(Math.random() * Lore.STORY.MORNING_QUIET.length)];
        embed.setDescription(`### **ALL RECORDS SECURE**\n${lore}`);
    } else {
        embed.setDescription(`### **${allDeaths.length} SIGNATURE${allDeaths.length === 1 ? '' : 'S'} ERASED**\nThe Sanctuary's monitors flicker. Fatal biometric redactions were detected during the night cycle.`);
        
        for (const d of allDeaths) {
            const roleStr = reveal
                ? (d.target.role ? `${d.target.role.emoji} **${d.target.role.name}** (${d.target.role.faction})` : '`Unknown`')
                : '🔒 **REDACTED**';
            
            let statusHeader = "💀 ARCHIVAL ERASURE";
            let codDescription = "Their signal was unceremoniously redacted.";

            if (d.isGuilt) {
                statusHeader = "💔 BIOMETRIC FLATLINE";
                codDescription = "Redacted due to internal safeguard overload (Remorse).";
            } else if (d.source?.role?.faction === 'Revisions') {
                statusHeader = "🛑 VIRAL OVERWRITE";
                codDescription = "Their biometric record was corrupted by the Viral Rot.";
            } else if (d.source?.role?.name === 'The Bookburner') {
                statusHeader = "🔥 THERMAL PURGE";
                codDescription = "Incinerated during a localized core-venting event.";
            } else if (d.source?.role?.name === 'The Ghostwriter') {
                statusHeader = "💀 LITERARY REDACTION";
                codDescription = "Their story is no longer readable. Systematic erasure.";
            } else if (d.source?.role?.name === 'The Shredder') {
                statusHeader = "💀 PHYSICAL ERASURE";
                codDescription = "Their signature was shredded by a physical security override.";
            }

            let lorePool = d.isGuilt ? Lore.STORY.ERASURE_GUILT : Lore.STORY.ERASURE_KILL;
            let lore = lorePool[Math.floor(Math.random() * lorePool.length)].replace('{name}', `**${d.target.name}**`);
            
            let reportStr = `**Status:** ${codDescription}\n**Identity:** ${roleStr}`;
            
            if (d.target.lastWill) {
                reportStr += `\n\n📜 **Retrieved Last Will:**\n> *"${d.target.lastWill}"*`;
            } else {
                reportStr += `\n\n📜 *No readable Last Will was found.*`;
            }
            
            embed.addFields({ 
                name: `[ ${statusHeader}: ${d.target.name.toUpperCase()} ]`, 
                value: `${lore}\n\n${reportStr}`
            });
        }
    }

    const alive = Array.from(game.players.values()).filter(p => p.alive);
    const dead = Array.from(game.players.values()).filter(p => !p.alive);
    
    embed.addFields(
        { 
            name: `🧍 Survivors (${alive.length})`, 
            value: alive.length > 0 ? alive.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None',
            inline: false
        },
        { 
            name: `💀 Redacted (${dead.length})`, 
            value: dead.length > 0 ? dead.map(p => p.isBot ? `🤖 ${p.name}` : `<@${p.id}>`).join(', ') : 'None',
            inline: false
        }
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mafia_roster_view_${game.hostId}`).setLabel('📖 View Roster').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildVictoryBanner(game, winner) {
    const isRevisionsWin = winner === 'Revisions';
    const embedColor = winner === 'Archivists' ? '#2ecc71' : (isRevisionsWin ? '#e74c3c' : '#f1c40f');
    
    const embed = baseEmbed(
        `🏆 VICTORY: ${winner.toUpperCase()}`,
        isRevisionsWin 
            ? '### **THE SANCTUARY HAS FALLEN.**\n*The records have been overwritten. The Viral Rot has claimed the archives.*'
            : '### **THE CORRUPTION HAS BEEN PURGED.**\n*The archives are secure. The indexers have held the line.*',
        null
    ).setColor(embedColor);

    return { embeds: [embed] };
}

function buildGameOverPayload(game, winner, secondaryWinners = []) {
    const isRevisionsWin = winner === 'Revisions';
    const embedColor = winner === 'Archivists' ? '#2ecc71' : (isRevisionsWin ? '#e74c3c' : '#f1c40f');
    
    const embed = baseEmbed('📦 Archival Record: Session Finalized', null, null)
        .setColor(embedColor)
        .setTimestamp();

    if (secondaryWinners.length > 0) {
        embed.addFields({ name: '🌟 Outstanding Victors', value: secondaryWinners.map(name => `• **${name}**`).join('\n') });
    }

    const alive = Array.from(game.players.values()).filter(p => p.alive);
    const dead = Array.from(game.players.values()).filter(p => !p.alive);

    const survivorList = alive.map(p => {
        const roleStr = p.role ? `${p.role.emoji} ${p.role.name}` : 'Unknown';
        return `🟢 <@${p.id}> — **${roleStr}**`;
    }).join('\n') || '*No survivors listed in this archive.*';

    const casualtyList = dead.map(p => {
        const roleStr = p.role ? `(${p.role.name})` : '';
        return `💀 ~~<@${p.id}>~~ **${roleStr}**`;
    }).join('\n') || '*No casualties recorded last cycle.*';

    embed.addFields(
        { name: `🧍 Survivors (${alive.length})`, value: survivorList, inline: false },
        { name: `💀 Casualties (${dead.length})`, value: casualtyList, inline: false }
    );

    const timeline = dead
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

function buildRosterPayload(game) {
    const alive = Array.from(game.players.values()).filter(p => p.alive);
    const dead = Array.from(game.players.values()).filter(p => !p.alive);

    const embed = baseEmbed('📊 Sanctuary Roster Status', 
        `**Session Integrity:** ${game.isSecure ? 'Secure' : 'Public'}\n**Current Phase:** ${game.state}\n**Day:** ${game.dayCount}`, 
        null
    ).setColor(Lore.COLORS.TWILIGHT);

    const survivorList = alive.map(p => {
        const icon = p.isBot ? '🤖' : '👤';
        const vote = p.voteTarget ? (p.voteTarget === 'skip' ? ' [✓ Skip]' : ' [✓ Cast]') : '';
        return `${icon} **${p.name}**${vote}`;
    }).join('\n') || 'No survivors remaining.';

    const redactionList = dead.map(p => {
        const role = game.settings.revealRoles ? (p.role ? ` (${p.role.name})` : '') : '';
        return `💀 ~~${p.name}~~${role}`;
    }).join('\n') || 'No redactions recorded.';

    embed.addFields(
        { name: `🧍 Survivors (${alive.length})`, value: survivorList, inline: true },
        { name: `💀 Redacted (${dead.length})`, value: redactionList, inline: true }
    );

    return { embeds: [embed], flags: 64 };
}

function buildConflictPayload(game, isRunning, user) {
    const embed = baseEmbed('⚠️ Identity Conflict Detected', 
        `You currently have an active session in **${game.guildId === 'unknown' ? 'an unknown sanctuary' : 'another sector'}**.\n\n` +
        `**State:** \`${game.state}\`\n**Survivors:** ${game.players.size}\n\n` +
        `Would you like to continue the existing simulation or purge the record and start a new one?`, 
        null
    ).setColor('#e67e22');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafia_host_conflict_continue_${game.hostId}`)
            .setLabel('⏳ Continue Presence')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`mafia_host_conflict_new_${game.hostId}`)
            .setLabel('🚫 New Sanctuary')
            .setStyle(ButtonStyle.Danger)
    );

    if (isRunning) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`mafia_host_conflict_end_${game.hostId}`)
                .setLabel('🔴 End Record')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    return { embeds: [embed], components: [row], flags: 64 };
}

function buildNightActionDropdown(player, game) {
    const options = game.getNightActionOptions(player);
    if (options.length === 0) return null;

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mafia_action_${game.hostId}_${game.state}_${game.dayCount}`)
            .setPlaceholder('📜 Select Archival Priority...')
            .addOptions(options.map(opt => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || `Execute protocol on ${opt.label}`
            })))
    );

    return row;
}

function buildNightHUD(player, game) {
    const endTime = Math.floor(game.phaseEndTime / 1000);
    const roleName = player.role.name.toUpperCase();
    
    let content = `🌑 **Phase: Night ${game.dayCount}** | Ends <t:${endTime}:R>\n`;
    content += `**Identity:** \`${roleName}\`\n\n`;
    
    if (player.intelligenceLog && player.intelligenceLog.length > 0) {
        content += `📂 **ARCHIVAL INTELLIGENCE:**\n${player.intelligenceLog.map(log => `> ${log}`).join('\n')}\n\n`;
    }
    
    if (player.nightActionTarget) {
        const target = game.players.get(player.nightActionTarget);
        content += `✅ **Action Locked:** Protocol established on \`${target?.name || 'Unknown'}\`.\n`;
    } else if (player.role.priority !== 99) {
        content += `⚠️ **Awaiting Input:** Open the dropdown below to select your night priority.\n`;
    } else {
        content += `💤 **Status:** No night actions authorized for your clearance level.\n`;
    }

    const rows = [];
    const actionDropdown = !player.nightActionTarget ? buildNightActionDropdown(player, game) : null;
    if (actionDropdown) rows.push(actionDropdown);

    const willLabel = player.lastWill ? '✍️ Update Last Will' : '✍️ Write Last Will';
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafia_will_${game.hostId}_${game.state}_${game.dayCount}`)
            .setLabel(willLabel)
            .setStyle(ButtonStyle.Secondary)
    ));

    return { content: `>>> ${content}`, components: rows };
}

function buildDayHUD(player, game) {
    const roleName = player.role.name.toUpperCase();
    let content = `☀️ **Phase: Day ${game.dayCount} (Discussion)**\n`;
    content += `**Identity:** \`${roleName}\`\n\n`;

    if (player.intelligenceLog && player.intelligenceLog.length > 0) {
        content += `📂 **ARCHIVAL INTELLIGENCE:**\n${player.intelligenceLog.map(log => `> ${log}`).join('\n')}\n\n`;
    }

    content += `The archives are open. Use the thread to deliberate with fellow survivors.`;

    const willLabel = player.lastWill ? '✍️ Update Last Will' : '✍️ Write Last Will';
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafia_will_${game.hostId}`)
            .setLabel(willLabel)
            .setStyle(ButtonStyle.Secondary)
    );

    return { content: `>>> ${content}`, components: [row] };
}

module.exports = { 
    baseEmbed,
    buildLobbyPayload, 
    buildSettingsPayload, 
    buildSpectatePayload, 
    buildActionHub, 
    buildSurvivalGuide,
    buildMorningReport,
    buildGameOverPayload,
    buildRoleCard,
    buildMafiaProfile,
    buildEndedLobbyPayload,
    buildStagnationPayload,
    buildRosterPayload,
    buildConflictPayload,
    buildNightHUD,
    buildDayHUD,
    buildNightActionDropdown
};
