async function resolveNightStack(game) {
    const alivePlayersList = game.getAlivePlayers();

    // Trigger test bots
    const { handleBotNightActions } = require('./MafiaBots');
    handleBotNightActions(game);

    // Collect all actions from players
    const actions = [];
    const diagnosticLog = [];

    for (const p of alivePlayersList) {
        if (p.nightActionTarget && p.role) {
            // --- AUTHORIZATION CHECK ---
            const authorizedOptions = game.getNightActionOptions(p);
            const isAuthorized = authorizedOptions.some(opt => opt.value === p.nightActionTarget);
            
            if (!isAuthorized) {
                diagnosticLog.push(`⚠️ **Unauthorized Override:** ${p.name} (${p.role.name}) attempted to target \`${p.nightActionTarget}\` [ACCESS DENIED].`);
                p.nightActionTarget = null;
                continue;
            }

            let target = game.players.get(p.nightActionTarget);
            if (p.nightActionTarget === 'ignite') target = { id: 'ignite', name: 'Ignition Framework', isProtected: false };
            
            if (target) {
                diagnosticLog.push(`📡 **Frequency Locked:** ${p.name} (${p.role.name}) targeted **${target.name}**.`);
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
        // [SIMULTANEOUS RESOLUTION] We no longer check if source.alive here.
        // Actions theoretically happen at the same time, though ordered for side-effects.
        // This ensures dying players still get their results.

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
                        // [VANILLA CONVERSION] Strip powers upon infection for balance
                        const { Revision } = require('./MafiaRoles');
                        target.role = new Revision(target);
                        target.role.faction = 'Revisions'; 
                        
                        readings.push({ viewerId: target.id, message: `🩸 **You have been infected.** The Viral Rot has taken hold. You are now aligned with the **Revisions** (Infected). You win with them.` });
                        
                        if (game.archiveThreadId && !target.isBot) {
                            try {
                                const guild = game.thread.guild;
                                const mThread = await guild.channels.fetch(game.archiveThreadId).catch(() => null);
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
                        readings.push({ viewerId: source.id, message: `Your forensic scan of ${target.name}'s bio-signature revealed traces of ${visitorName} (from night ${v.night}).\n\n*(Lore: You have developed a slight Biosync Conflict with them, but your voting biometrics remain stable.)*` });
                    } else {
                        readings.push({ viewerId: source.id, message: `Your forensic scan of ${target.name} found no discernable bio-traces recorded.` });
                    }
                }
                break;
        }
    }

    // Capture summary of effects for diagnostics
    for (const act of actions) {
        const { source, target, role, priority } = act;
        if (source.isRoleblocked) {
            diagnosticLog.push(`🚫 **Protocol Failure:** ${source.name} was quarantined (Censored) and failed to execute.`);
            continue;
        }

        if (priority === 2) diagnosticLog.push(`🛡️ **Barrier Sync:** ${target.name} was shielded by the Conservator.`);
        if (priority === 3 && target.isProtected) diagnosticLog.push(`🛡️ **Redaction Deflected:** Archive shields saved ${target.name} from erasure.`);
        if (priority === 4 && target.role?.faction === 'Revisions') diagnosticLog.push(`🩸 **Infection Spread:** ${target.name} has been co-opted by the Viral Rot.`);
    }

    // Apply deaths
    for (const d of deaths) {
        d.target.die();
        d.target.deathDay = game.dayCount;
    }

    return { deaths, readings, diagnosticLog };
}

module.exports = { resolveNightStack };
