class MafiaPlayer {
    constructor(user, isBot = false) {
        this.id = user.id;
        this.user = user; 
        this.name = user.username || user.displayName || user.name || `Player_${user.id}`;
        this.isBot = isBot;
        
        this.alive = true;
        this.role = null; 
        
        this.nightActionTarget = null;
        this.voteTarget = null;
        
        // Modifiers
        this.isDoused = false;
        this.isRoleblocked = false;
        this.isProtected = false;
        this.inkBoundTarget = null; 
        
        this.criticTarget = null;
        this.guilt = false;
        this.won = false;
        this.lastWill = null; // Final message revealed on death
        this.isConfirmed = false; 
        this.deathDay = null; // Track when they died for timelines
        this.missedVotes = 0; // Track AFK voting
    }

    assignRole(roleObject) {
         this.role = roleObject;
         this.role.player = this; // Link back to player
    }
    
    die() {
        this.alive = false;
        this.voteTarget = null;
        this.nightActionTarget = null;
    }

    resetForNight() {
        this.nightActionTarget = null;
        this.isRoleblocked = false;
        this.isProtected = false;
    }

    resetForDay() {
        this.voteTarget = null;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isBot: this.isBot,
            alive: this.alive,
            role: this.role,
            isDoused: this.isDoused,
            isRoleblocked: this.isRoleblocked,
            isProtected: this.isProtected,
            inkBoundTarget: this.inkBoundTarget,
            criticTarget: this.criticTarget,
            guilt: this.guilt,
            won: this.won,
            lastWill: this.lastWill,
            isConfirmed: this.isConfirmed,
            deathDay: this.deathDay,
            missedVotes: this.missedVotes
        };
    }

    fromJSON(data) {
        this.id = data.id;
        this.name = data.name;
        this.isBot = data.isBot;
        this.alive = data.alive;
        this.role = data.role;
        this.isDoused = data.isDoused;
        this.isRoleblocked = data.isRoleblocked;
        this.isProtected = data.isProtected;
        this.inkBoundTarget = data.inkBoundTarget;
        this.criticTarget = data.criticTarget;
        this.guilt = data.guilt;
        this.won = data.won;
        this.lastWill = data.lastWill;
        this.isConfirmed = data.isConfirmed || false;
        this.deathDay = data.deathDay;
        this.missedVotes = data.missedVotes || 0;
    }
}

module.exports = MafiaPlayer;
