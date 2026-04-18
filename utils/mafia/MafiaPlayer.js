const logger = require('../core/logger');
class MafiaPlayer {
    constructor(user, isBot = false) {
        this.id = user.id;
        this.user = user; 
        this.name = user.displayName || user.globalName || user.username || user.name || `Player_${user.id}`;
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
        this.controlPanelMessageId = null; // Track persistent DM panel
        this.initialVoiceChannelId = null; // Original VC to return to
        this.lastControlState = null; // Track UI hash for dirty-checking
        this.lastNightResult = null; // Persistent investigation findings
        this.roleCardUrl = null; // Cached Discord CDN URL for role image
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
        this.inkBoundTarget = null;
        this.lastNightResult = null; // Clear old findings when new night starts
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
            missedVotes: this.missedVotes,
            controlPanelMessageId: this.controlPanelMessageId,
            initialVoiceChannelId: this.initialVoiceChannelId,
            lastControlState: this.lastControlState,
            lastNightResult: this.lastNightResult,
            roleCardUrl: this.roleCardUrl
        };
    }

    fromJSON(data) {
        this.id = data.id;
        this.name = data.name;
        this.isBot = data.isBot;
        this.alive = data.alive;
        
        if (data.role) {
            try {
                const Roles = require('./MafiaRoles');
                const className = data.role.name.replace(/\s+/g, '');
                const RoleClass = Roles[className];
                
                if (RoleClass) {
                    this.role = new RoleClass(this);
                    Object.assign(this.role, data.role);
                    this.role.player = this; 
                } else {
                    this.role = data.role;
                }
            } catch (e) {
                logger.error(`[Mafia] Failed to reconstruct role for ${this.name}:`, e, 'Mafia');
                this.role = data.role;
            }
        } else {
            this.role = null;
        }

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
        this.controlPanelMessageId = data.controlPanelMessageId || null;
        this.initialVoiceChannelId = data.initialVoiceChannelId || null;
        this.lastControlState = data.lastControlState || null;
        this.lastNightResult = data.lastNightResult || null;
        this.roleCardUrl = data.roleCardUrl || null;
    }
}

module.exports = MafiaPlayer;
