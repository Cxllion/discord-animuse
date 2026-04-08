function resolveNightStack(game) {
    const alivePlayersList = game.getAlivePlayers();

    // Trigger test bots
    const { handleBotNightActions } = require('./MafiaBots');
    handleBotNightActions(game);

    // Collect all actions from players
    const actions = [];
    for (const p of alivePlayersList) {
        if (p.nightActionTarget && p.role) {
            let target = game.players.get(p.nightActionTarget);
            if (p.nightActionTarget === 'ignite') target = { id: 'ignite', name: 'Ignition Framework', isProtected: false };
            if (target) {
                actions.push({
                    source: p,
                    target: target,
                    role: p.role,
                    priority: p.role.priority
                });
            }
        }
    }

    // Sort actions by priority (1 to 5)
    // 1: Redaction, 2: Binding, 3: Erasure, 4: Rewrite, 5: Reading
    actions.sort((a, b) => a.priority - b.priority);

    const deaths = [];
    const readings = [];

    // Process actions
    for (const act of actions) {
        const { source, target, role, priority } = act;
        
        // Record all visits for history
        if (target.id !== 'ignite') {
            game.visitHistory.push({ night: game.dayCount, sourceId: source.id, targetId: target.id });
        }
        
        // Skip if source was roleblocked earlier in the stack
        if (source.isRoleblocked) continue;
        if (!source.alive) continue;

        switch (priority) {
            case 1: // Redactions (Censor)
                target.isRoleblocked = true;
                break;
                
            case 2: // Bindings (Conservator)
                target.isProtected = true;
                break;
                
            case 3: // Erasures (Shredder, Ghostwriter, Bookburner)
                if (role.name === 'The Bookburner') {
                    if (target.id === 'ignite') {
                        for (const op of alivePlayersList) {
                            if (op.isDoused && op.id !== source.id) {
                                if (!deaths.some(d => d.target.id === op.id)) deaths.push({ target: op, source: source });
                            }
                        }
                    } else {
                        target.isDoused = true;
                    }
                } else {
                    if (!target.isProtected) {
                        if (!deaths.some(d => d.target.id === target.id)) {
                            deaths.push({ target: target, source: source });
                        }
                        if (role.name === 'The Ghostwriter' && target.role?.faction === 'Archivists') {
                            source.guilt = true;
                        }
                    }
                }
                break;
                
            case 4: // Rewrites (Corruptor)
                if (!target.alive) break; // Can't infect the dead
                if (!deaths.find(d => d.target.id === target.id)) {
                    // Convert target's faction if applicable
                    if (target.role && target.role.faction === 'Archivists') {
                        target.role.faction = 'Revisions';
                        readings.push({ viewerId: target.id, message: `🩸 **You have been infected.** The Viral Rot has taken hold. You are now aligned with the **Revisions** (Infected). You win with them.` });
                        
                        if (game.archiveThreadId && !target.isBot) {
                            try {
                                const mThread = await game.thread.guild.channels.fetch(game.archiveThreadId).catch(() => null);
                                if (mThread) await mThread.members.add(target.id).catch(() => null);
                            } catch(e) {}
                        }
                    }
                }
                break;
                
            case 5: // Readings (Indexer, Scribe)
                if (role.name === 'The Indexer') {
                    // The Plagiarist reads as Archivist
                    let readFaction = target.role.faction;
                    if (target.role.name === 'The Plagiarist') readFaction = 'Archivists';
                    readings.push({ viewerId: source.id, message: `Your diagnostic of ${target.name} reveals they are aligned with the ${readFaction}.` });
                }
                if (role.name === 'The Scribe') {
                    // Scribe checks dead bodies for visitors across all previous nights
                    const visitors = game.visitHistory.filter(h => h.targetId === target.id && h.sourceId !== source.id);
                    if (visitors.length > 0) {
                        const v = visitors[Math.floor(Math.random() * visitors.length)];
                        const visitorName = game.players.get(v.sourceId)?.name || "Unknown";
                        readings.push({ viewerId: source.id, message: `Your forensic scan of ${target.name}'s bio-signature revealed traces of ${visitorName} (from night ${v.night}).\n\n⚠️ **You are now Ink-Bound (Biosync Conflict) and cannot vote for them.**` });
                        source.inkBoundTarget = v.sourceId;
                    } else {
                        readings.push({ viewerId: source.id, message: `Your forensic scan of ${target.name} found no discernable bio-traces recorded.` });
                    }
                }
                break;
        }
    }

    // Apply deaths
    for (const d of deaths) {
        d.target.die();
        d.target.deathDay = game.dayCount;
    }

    return { deaths, readings };
}

module.exports = { resolveNightStack };
