function handleBotNightActions(game) {
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    const validTargets = game.getAlivePlayers();

    for (const bot of aliveBots) {
        if (!bot.role || bot.role.priority === 99) continue;

        let possible = validTargets.filter(p => p.id !== bot.id && p.role);
        
        // Revisions don't target each other at night usually
        if (bot.role.faction === 'Revisions') {
            possible = possible.filter(p => !p.role || p.role.faction !== 'Revisions');
        }

        if (possible.length > 0) {
            const target = possible[Math.floor(Math.random() * possible.length)];
            bot.nightActionTarget = target.id;
            console.log(`[TESTING] ${bot.name} (${bot.role.name}) targeted ${target.name} for night action.`);
        }
    }
    
    // Auto-resolve night if all players are bots, or if bots just finished the last action needed
    // In a full implementation we would check if all players have acted here.
}

function handleBotDayVoting(game) {
    const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
    const alivePlayers = game.getAlivePlayers();

    for (const bot of aliveBots) {
        const delay = Math.floor(Math.random() * 10000) + 5000;
        
        setTimeout(() => {
            if (game.state !== 'VOTING' || !bot.alive) return;

            const tallies = {};
            alivePlayers.forEach(p => {
                if (p.voteTarget) {
                    tallies[p.voteTarget] = (tallies[p.voteTarget] || 0) + 1;
                }
            });

            let targetId = null;
            
            // 50% chance to bandwagon
            if (Math.random() > 0.5 && Object.keys(tallies).length > 0) {
                let maxVotes = 0;
                let leader = null;
                for (const [id, count] of Object.entries(tallies)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        leader = id;
                    }
                }
                
                if (leader && leader !== bot.id && leader !== bot.inkBoundTarget) {
                    targetId = leader;
                }
            }
            
            // Random target
            if (!targetId) {
                const others = alivePlayers.filter(p => p.id !== bot.id && p.id !== bot.inkBoundTarget);
                if (others.length > 0) {
                    targetId = others[Math.floor(Math.random() * others.length)].id;
                }
            }

            if (targetId) {
                const targetPlayer = game.players.get(targetId);
                // Revision avoiding fellow Revision vote
                if (bot.role && targetPlayer && targetPlayer.role && bot.role.faction === 'Revisions' && targetPlayer.role.faction === 'Revisions') {
                    const nonRevs = alivePlayers.filter(p => !p.role || p.role.faction !== 'Revisions');
                    if (nonRevs.length > 0) {
                         targetId = nonRevs[Math.floor(Math.random() * nonRevs.length)].id;
                    }
                }

                bot.voteTarget = targetId;
                const targetP = game.players.get(targetId);
                if (targetP) {
                    console.log(`[TESTING] ${bot.name} voted for ${targetP.name}`);
                }
                
                // If there's a central game.checkDayEnd() we would call it here:
                // if (typeof game.checkDayEnd === 'function') game.checkDayEnd();
            }

        }, delay);
    }
}

module.exports = { handleBotNightActions, handleBotDayVoting };
