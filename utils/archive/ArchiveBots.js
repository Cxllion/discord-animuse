function handleBotNightActions(game) {
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    const alivePlayers = game.getAlivePlayers();

    for (const bot of aliveBots) {
        if (!bot.role || bot.role.priority === 99) continue;

        let possible = [];
        
        // Smarter Targeting Logic
        if (bot.role.faction === 'Revisions') {
            // Revisions try to find Archivists (Town)
            possible = alivePlayers.filter(p => !p.role || p.role.faction !== 'Revisions');
        } else if (bot.role.faction === 'Archivists') {
            if (bot.role.name === 'The Conservator') {
                // Conservator (Doctor) protects suspected Archivists or themselves
                possible = alivePlayers.filter(p => p.id !== bot.id);
                // 30% chance to self-protect if allowed (usually but not always)
                if (Math.random() < 0.3) bot.nightActionTarget = bot.id; 
            } else {
                // Other town members target everyone else
                possible = alivePlayers.filter(p => p.id !== bot.id);
            }
        } else {
            // Neutrals target anyone
            possible = alivePlayers.filter(p => p.id !== bot.id);
        }

        if (possible.length > 0 && !bot.nightActionTarget) {
            const target = possible[Math.floor(Math.random() * possible.length)];
            bot.nightActionTarget = target.id;
            console.log(`[ARCHIVE-AI] ${bot.name} (${bot.role.name}) targeted ${target.name}.`);
        }
    }
}

function handleBotDayVoting(game) {
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    const alivePlayers = game.getAlivePlayers();

    for (const bot of aliveBots) {
        // Random thinking delay to mimic real players
        const delay = Math.floor(Math.random() * 15000) + 5000;
        
        const timer = setTimeout(() => {
            if (game.state !== 'VOTING' || !bot.alive || game.isDestroyed) return;

            const tallies = {};
            alivePlayers.forEach(p => {
                if (p.voteTarget) {
                    tallies[p.voteTarget] = (tallies[p.voteTarget] || 0) + 1;
                }
            });

            let targetId = null;
            
            // Logic: Bandwagoning or Faction Defense
            const leadingTargetId = Object.entries(tallies).sort((a,b) => b[1] - a[1])[0]?.[0];
            const leadingVotes = tallies[leadingTargetId] || 0;

            if (bot.role?.faction === 'Revisions') {
                const leaderP = game.players.get(leadingTargetId);
                if (leaderP?.role?.faction === 'Revisions' && leadingVotes >= (alivePlayers.length / 3)) {
                    // Try to shift vote AWAY from a fellow Revision if they are dying
                    const others = alivePlayers.filter(p => p.id !== bot.id && p.role?.faction !== 'Revisions');
                    if (others.length > 0) targetId = others[Math.floor(Math.random() * others.length)].id;
                }
            }

            // Normal bandwagon logic (High chance if voting is already leaning one way)
            if (!targetId && leadingTargetId && Math.random() < 0.6) {
                targetId = leadingTargetId;
            }

            // Fallback: Random
            if (!targetId) {
                const others = alivePlayers.filter(p => p.id !== bot.id && p.id !== bot.inkBoundTarget);
                if (others.length > 0) targetId = others[Math.floor(Math.random() * others.length)].id;
            }

            if (targetId && targetId !== bot.id) {
                bot.voteTarget = targetId;
                game.updateVotingBoard();
            }

        }, delay);
        game.botTimers.push(timer);
    }
}

module.exports = { handleBotNightActions, handleBotDayVoting };
