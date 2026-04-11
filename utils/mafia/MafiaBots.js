function handleBotNightActions(game) {
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    const alivePlayers = game.getAlivePlayers();

    for (const bot of aliveBots) {
        if (!bot.role || bot.role.priority === 99) continue;

        let options = game.getNightActionOptions(bot);
        if (options.length === 0) continue;

        // --- STRATEGIC INTELLIGENCE: FACTION AWARENESS ---
        if (bot.role.faction === 'Revisions') {
            // Revisions should NEVER target other Revisions
            options = options.filter(opt => {
                const target = game.players.get(opt.value);
                return !target || target.role?.faction !== 'Revisions';
            });
        } else if (bot.role.faction === 'Archivists') {
            // Archivists should prioritize people they haven't cleared yet
            // (Naive implementation: priority for Non-Bots or random)
            if (options.length > 1) {
                const nonSelf = options.filter(opt => opt.value !== bot.id);
                if (nonSelf.length > 0) options = nonSelf;
            }
        }

        // Fallback if filtering left no options
        if (options.length === 0) options = game.getNightActionOptions(bot);

        if (!bot.nightActionTarget) {
            const targetData = options[Math.floor(Math.random() * options.length)];
            bot.nightActionTarget = targetData.value;
            console.log(`[MAFIA-AI] ${bot.name} (${bot.role.name}) targeted ${targetData.label}.`);
        }
    }
}

function handleBotDayVoting(game, specificBot = null) {
    const aliveBots = specificBot ? [specificBot] : game.getAlivePlayers().filter(p => p.isBot);
    const alivePlayers = game.getAlivePlayers();
    const humans = alivePlayers.filter(p => !p.isBot);

    for (const bot of aliveBots) {
        if (!bot.alive) continue;

        const humanTallies = {};
        humans.forEach(h => {
            if (h.voteTarget) {
                humanTallies[h.voteTarget] = (humanTallies[h.voteTarget] || 0) + 1;
            }
        });

        const sortedHumans = Object.entries(humanTallies).sort((a,b) => b[1] - a[1]);
        const bestHumanLedTargetId = sortedHumans[0]?.[0];

        let targetId = null;

        if (bestHumanLedTargetId) {
            targetId = bestHumanLedTargetId;
        } 
        else {
            const totalTallies = {};
            alivePlayers.forEach(p => {
                if (p.voteTarget) totalTallies[p.voteTarget] = (totalTallies[p.voteTarget] || 0) + 1;
            });
            targetId = Object.entries(totalTallies).sort((a,b) => b[1] - a[1])[0]?.[0];
        }

        if (!targetId) {
            if (Math.random() < 0.1) {
                targetId = 'skip';
            } else {
                const possible = alivePlayers.filter(p => p.id !== bot.id && p.id !== bot.inkBoundTarget);
                if (possible.length > 0) targetId = possible[Math.floor(Math.random() * possible.length)].id;
            }
        }

        if (targetId && targetId !== bot.id) {
            bot.voteTarget = targetId;
            console.log(`[MAFIA-AI] ${bot.name} (Bot) finalized vote for: ${targetId}`);
        }
    }
}

async function handleBotDaySpeech(game) {
    if (!game.thread || !game.thread.parent) return;
    
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    if (aliveBots.length === 0) return;
    
    const lastNight = game.dayCount - 1; 

    let archiveWebhook = null;
    try {
        const webhooks = await game.thread.parent.fetchWebhooks();
        archiveWebhook = webhooks.find(wh => wh.token);
        if (!archiveWebhook) {
            archiveWebhook = await game.thread.parent.createWebhook({
                name: 'Sanctuary Archive Node',
                avatar: 'https://cdn.discordapp.com/embed/avatars/1.png' 
            });
        }
    } catch (e) {
        console.error('[MAFIA-AI] Could not setup webhook for bot speech:', e);
    }
    
    const timers = [];
    
    for (const bot of aliveBots) {
        if (!bot.alive || !bot.role) continue;
        
        if (Math.random() > 0.8) continue;
        
        let message = null;
        
        if (bot.role.name === 'The Indexer' && bot.nightActionTarget) {
            const target = game.players.get(bot.nightActionTarget);
            if (target) {
                const targetDisplay = target.isBot ? `**${target.name}**` : `<@${target.id}>`;
                const faction = target.role?.faction === 'Revisions' && target.role?.name !== 'The Plagiarist' ? 'Revisions' : 'Archivists';
                if (faction === 'Revisions') {
                    message = `🚨 **ALERT:** My bio-scans confirm that ${targetDisplay} is corrupted! They are aligned with the Revisions.`;
                } else {
                    message = `🛡️ I scanned ${targetDisplay} last night. Their signature is clean (Archivists).`;
                }
            }
        } else if (bot.role.name === 'The Conservator' && bot.nightActionTarget) {
            if (bot.nightActionTarget !== bot.id) {
                const target = game.players.get(bot.nightActionTarget);
                if (target) {
                    const targetDisplay = target.isBot ? `**${target.name}**` : `<@${target.id}>`;
                    message = `🛡️ I maintained a protective barrier over ${targetDisplay} last night.`;
                }
            }
        } else if (bot.role.name === 'The Scribe' && bot.nightActionTarget) {
            const target = game.players.get(bot.nightActionTarget);
            if (target) {
                const targetNameDisplay = target.isBot ? `**${target.name}**` : `<@${target.id}>`;
                const visits = game.visitHistory.filter(v => v.night === lastNight && v.targetId === target.id && v.sourceId !== bot.id);
                if (visits.length > 0) {
                    const visitors = visits.map(v => {
                        const vp = game.players.get(v.sourceId);
                        return (vp && vp.isBot) ? `**${vp.name}**` : `<@${v.sourceId}>`;
                    });
                    message = `🔎 I analyzed the remains of ${targetNameDisplay}. They were visited by: ${visitors.join(', ')}.`;
                } else {
                    message = `🔎 I analyzed the remains of ${targetNameDisplay}, but found no recent traces.`;
                }
            }
        }
        
        if (message) {
            // --- AI INTEL PRESERVATION (LAST WILL SYNC) ---
            bot.lastWill = message.replace(/\*\*.*?\*\*|<@\d+>/g, (match) => {
                if (match.startsWith('<@')) {
                    const id = match.replace(/[<@>]/g, '');
                    return game.players.get(id)?.name || 'Unknown';
                }
                return match.replace(/\*\*/g, '');
            });

            const timer = setTimeout(async () => {
                if (game.state === 'DAY' && !game.isDestroyed) {
                    if (archiveWebhook) {
                        await archiveWebhook.send({
                            content: message,
                            username: bot.name,
                            avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png',
                            threadId: game.thread.id
                        }).catch(() => {});
                    } else {
                        game.thread.send(`[**${bot.name}**]: ${message}`).catch(() => {});
                    }
                }
            }, Math.random() * 5000 + 2000);
            timers.push(timer);
        }
    }
    return timers;
}

module.exports = { handleBotNightActions, handleBotDayVoting, handleBotDaySpeech };
