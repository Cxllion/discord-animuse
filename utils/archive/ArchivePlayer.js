class ArchivePlayer {
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
}

module.exports = ArchivePlayer;
