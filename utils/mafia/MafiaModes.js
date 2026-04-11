const {
    Role,
    Archivist,
    Revision,
    TheConservator,
    TheShredder,
    TheIndexer,
    TheHeadCurator,
    TheGhostwriter,
    TheScribe,
    TheCensor,
    ThePlagiarist,
    TheCorruptor,
    TheAnomaly,
    TheCritic,
    TheBookburner
} = require('./MafiaRoles');

function generateRolesForMode(modeName, playerCount) {
    const roles = [];

    let revisionCount = Math.max(1, Math.floor((playerCount - 1) / 3));
    let townCount = playerCount - revisionCount;

    if (modeName === 'Classic Archive' || modeName === 'First Edition') {
        roles.push(new TheShredder()); revisionCount--;
        if (revisionCount > 0) { roles.push(new ThePlagiarist()); revisionCount--; }
        while (revisionCount > 0) { roles.push(new Revision()); revisionCount--; }
        
        if (townCount > 0) { roles.push(new TheConservator()); townCount--; }
        if (townCount > 0) { roles.push(new TheIndexer()); townCount--; }
        if (townCount > 0 && playerCount >= 7) { roles.push(new TheGhostwriter()); townCount--; }
        while (townCount > 0) { roles.push(new Archivist()); townCount--; }
    } 
    else if (modeName === 'Unabridged Archive' || modeName === 'Chaos' || modeName === 'Redacted Files') {
        const unboundPool = [new TheAnomaly(), new TheCritic(), new TheBookburner()];
        const archivistPool = [new TheGhostwriter(), new TheScribe(), new TheConservator(), new TheIndexer(), new TheHeadCurator()];
        const revisionPool = [new TheShredder(), new TheCensor(), new ThePlagiarist()];
        
        // Essential starters
        roles.push(revisionPool.shift() || new Revision()); revisionCount--;
        
        // SCALING UNBOUND: 1 per 5 players
        let unbTarget = Math.max(1, Math.floor(playerCount / 5));
        while (unbTarget > 0 && unboundPool.length > 0) {
            roles.push(unboundPool.shift());
            townCount--;
            unbTarget--;
        }
        
        while (roles.length < playerCount) {
            if (revisionCount > 0) {
                roles.push(revisionPool.shift() || new Revision());
                revisionCount--;
            } else if (townCount > 0) {
                roles.push(archivistPool.shift() || new Archivist());
                townCount--;
            } else {
                roles.push(new Archivist());
            }
        }
    }
    else if (modeName === 'Ink Rot') {
        roles.push(new TheCorruptor()); revisionCount--;
        // Backup Revision for larger games
        if (playerCount >= 7 && revisionCount > 0) { roles.push(new TheShredder()); revisionCount--; }
        
        if (townCount > 0) { roles.push(new TheConservator()); townCount--; }
        if (townCount > 0) { roles.push(new TheIndexer()); townCount--; }
        while (revisionCount > 0) { roles.push(new Revision()); revisionCount--; }
        while (townCount > 0) { roles.push(new Archivist()); townCount--; }
    } else {
        roles.push(new TheShredder()); revisionCount--;
        while (revisionCount > 0) { roles.push(new Revision()); revisionCount--; }
        while (townCount > 0) { roles.push(new Archivist()); townCount--; }
    }
    
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}

module.exports = { generateRolesForMode };
