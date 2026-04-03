const {
    Role,
    Archivist,
    Revision,
    TheConservator,
    TheShredder,
    TheIndexer,
    ThePlurality,
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

    let revisionCount = Math.max(1, Math.floor(playerCount / 4));
    let townCount = playerCount - revisionCount;

    if (modeName === 'First Edition') {
        roles.push(new TheShredder()); revisionCount--;
        if (revisionCount > 0) { roles.push(new ThePlagiarist()); revisionCount--; }
        while (revisionCount > 0) { roles.push(new Revision()); revisionCount--; }
        
        if (townCount > 0) { roles.push(new TheConservator()); townCount--; }
        if (townCount > 0) { roles.push(new TheIndexer()); townCount--; }
        while (townCount > 0) { roles.push(new Archivist()); townCount--; }
    } 
    else if (modeName === 'Unabridged Archive' || modeName === 'Chaos' || modeName === 'Redacted Files') {
        const unboundPool = [new TheAnomaly(), new TheCritic(), new TheBookburner()];
        const archivistPool = [new TheGhostwriter(), new TheScribe(), new TheConservator(), new TheIndexer(), new ThePlurality()];
        const revisionPool = [new TheShredder(), new TheCensor(), new ThePlagiarist()];
        
        roles.push(revisionPool.shift() || new Revision()); revisionCount--;
        roles.push(unboundPool.shift()); 
        townCount--; 
        
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
        if (townCount > 0) { roles.push(new TheConservator()); townCount--; }
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
