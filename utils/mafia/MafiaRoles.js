class Role {
    constructor(player) {
        this.player = player;
        this.name = 'Unknown';
        this.faction = 'Unknown';
        this.description = '';
        this.priority = 0; // Lower number = resolves first
        this.vote_feedback = [
            "You've marked **{target}** as a potential infection vector.",
            "Your vote is indexed: **{target}** should be cast into the wastes.",
            "The Council recorded your judgment: **{target}** must leave the sanctuary.",
            "You've cast your ballot, sentencing **{target}** to the external air-lock.",
            "Survival demands it: you've voted for **{target}**'s exile.",
            "You've flagged **{target}** for a permanent removal from the Safe Zone.",
            "Your hand is on the lever for **{target}**'s ejection.",
            "You've spoken your truth: **{target}** is a risk to the sanctuary.",
            "The library's survival rests behind your call for **{target}**'s removal.",
            "You've closed the doors on **{target}**, voting for their expulsion."
        ];
    }
    toJSON() {
        const json = { ...this };
        delete json.player;
        return json;
    }
    useAbility(game, targetId) { return null; }
    
    // UI function to get Discord ActionRow with valid targets if any
    getNightActionRow(players) {
        return null; 
    }
    
    executeAction(target, game) { }
}

class Archivist extends Role {
    constructor(player) {
        super(player);
        this.name = 'Archivist';
        this.faction = 'Archivists';
        this.emoji = '📜';
        this.description = 'Vanilla Town. You have no special abilities, but your vote matters.';
        this.priority = 99;
        this.feedback = [
            "You check the oxygen seals, staying vigilant for any signs of the Rot.",
            "You spend the night monitoring the perimeter, hoping the walls hold.",
            "The silence of the sanctuary is heavy with the weight of humanity's legacy.",
            "You've decided to trust the protocols and watch over your sector.",
            "Tonight, you're just another survivor in the last library on Earth.",
            "You've chosen to stay in the filtered wings where the air is still sweet.",
            "A quiet night of resource management is what you needed.",
            "You've shared some rations and whispers about tomorrow's council.",
            "The world's ending feels far away in this concrete tomb.",
            "You've accepted your role as a protector of what remains."
        ];
    }
}

class Revision extends Role {
    constructor(player) {
        super(player);
        this.name = 'Revision';
        this.faction = 'Revisions';
        this.emoji = '👤';
        this.description = 'Vanilla Revision. Infiltrate and compromise the sanctuary from within.';
        this.priority = 99;
        this.feedback = [
            "You blend into the shadows, waiting for the Virus to take hold.",
            "The infection hums a dark tune in your ear as you wait.",
            "Tonight, the air in the library feels thick with corruption.",
            "You've decided to keep your head down and wait for the signal.",
            "A drop of blackened ink falls from your pen as you plan with your team.",
            "The shadows of the sanctuary are your greatest ally tonight.",
            "You've marked down a potential target for the next quarantine breach.",
            "Tonight, you're the silent author of the library's downfall.",
            "The sanctuary's history is about to be violently rewritten.",
            "You've committed yourself fully to the spread of the Rot."
        ];
    }
}

class TheConservator extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Conservator';
        this.faction = 'Archivists';
        this.emoji = '🏥';
        this.description = 'Healer: Binds a player at night, protecting them from Erasure.';
        this.priority = 2; // Bindings
        this.feedback = [
            "You bind **{target}** in protective parchment, shielding them from the Rot.",
            "Your oxygen seals flow into **{target}**, securing their shelf against the dark.",
            "The sanctuary's monitors guide your hands to preserve **{target}**.",
            "You've marked **{target}** as a secure volume in the archive tonight.",
            "The Restricted Section's wards now extend to **{target}**.",
            "You weave a safety seal around **{target}**'s core essence.",
            "Tonight, the grey static will not claim **{target}**.",
            "A ghostly sentinel watches over **{target}** at your command.",
            "You've indexed **{target}** as 'Uninfected' for the night.",
            "The library's oldest bindings wrap **{target}** in a safe embrace."
        ];
        this.lastTargetId = null; // Prevent double-healing
    }

    executeAction(target, game) {
        target.isProtected = true;
        this.lastTargetId = target.id;
    }
}

class TheShredder extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Shredder';
        this.faction = 'Revisions';
        this.emoji = '🗡️';
        this.description = 'Goon: The designated killer for the faction.';
        this.priority = 3; // Erasures
        this.feedback = [
            "You sharpen your tools, eager to silicate **{target}** from the sanctuary.",
            "Tonight, **{target}**'s vital signs will be flatlined.",
            "The Virus has spoken: **{target}** is the next to be silenced.",
            "You prepare the incinerator for **{target}**'s final chapter.",
            "One by one, the cells of **{target}** will vanish into grey static.",
            "You've marked **{target}** for a permanent logout.",
            "The silence in the library will be broken by **{target}**'s end.",
            "Tonight's infiltration requires the elimination of **{target}**.",
            "You've placed **{target}** on the path of the shredder's sensors.",
            "The forbidden rot calls for the sacrifice of **{target}**."
        ];
    }
}

class TheIndexer extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Indexer';
        this.faction = 'Archivists';
        this.emoji = '🔍';
        this.description = 'Investigator: Reads a player\'s spine at night to learn their true faction.';
        this.priority = 5; // Readings
        this.feedback = [
            "You carefully scan the biometrics of **{target}**, looking for hidden infection.",
            "The sanctuary's database hums as you cross-reference **{target}**'s records.",
            "You peel back the security covering of **{target}** to reveal their true state.",
            "Tonight, the data footprint of **{target}** will be indexed in your logs.",
            "You've focused your scanner on **{target}**'s most hidden sectors.",
            "The sirens of the library reveal the discordant frequency of **{target}**.",
            "Every bookmark and login log of **{target}** is now under your scrutiny.",
            "You've begun a deep diagnostic into the essence of **{target}**.",
            "The sanctuary's truth-seals glow as you examine **{target}**.",
            "By dawn, you will know exactly if **{target}** is clean or compromised."
        ];
    }
}

class TheHeadCurator extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Head Curator';
        this.faction = 'Archivists';
        this.emoji = '👑';
        this.description = 'Chief Archivist: Their vote counts as two during the Day phase.';
        this.priority = 99; // Passive
    }
}

class TheGhostwriter extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Ghostwriter';
        this.faction = 'Archivists';
        this.emoji = '✍️';
        this.description = 'Vigilante: Can Edit Out (kill) a player at night. If they kill an Archivist, they die of guilt the next night.';
        this.priority = 3; // Erasures
        this.feedback = [
            "You prepare a lethal dose of antitoxin, preparing to flush **{target}** out.",
            "Tonight, you take the role of executioner, targeting **{target}**'s vitals.",
            "You've decided that **{target}**'s threat to the sanctuary must end.",
            "The heavy responsibility of the Ghostwriter falls upon **{target}** tonight.",
            "You've prepared a final, violent quarantine for **{target}**.",
            "The sanctuary's survival demands the removal of **{target}**, and you agree.",
            "You've begun writing the final shutdown command for **{target}**.",
            "A strike of your pen will soon redact **{target}** from the survival list.",
            "Tonight, you deliver the library's harshest judgment to **{target}**.",
            "You've set your sights on **{target}**, hoping your intent remains pure."
        ];
    }
}

class TheScribe extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Scribe';
        this.faction = 'Archivists';
        this.emoji = '🖋️';
        this.description = 'Forensic Medium: Checks a dead body at night to find one random person who interacted with them. Becomes Ink-Bound (Lore) to that suspect.';
        this.priority = 5; // Readings
        this.feedback = [
            "You kneel beside the bio-hazard zone, tracing the visitors of **{target}**.",
            "The former bio-signature of **{target}** begins to whisper its secrets.",
            "You use your medical intuition to see who last contacted **{target}**.",
            "Tonight, the contact history of **{target}** will be logged in your blood-vials.",
            "You've begun a scan to isolate the shadows that haunted **{target}**.",
            "The sanctuary's memory of **{target}** is vivid and treacherous.",
            "You've bound your quill to the fate of **{target}**'s former bunk.",
            "Tracing the traces of the fallen, you seek the identity of **{target}**'s contact.",
            "The echoes of the console reveal the last logins to touch **{target}**.",
            "You've started scribing the hidden truth behind **{target}**'s infection."
        ];
    }
}

class TheCensor extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Censor';
        this.faction = 'Revisions';
        this.emoji = '🔇';
        this.description = 'Roleblocker: Quarantines a player at night, stopping their ability.';
        this.priority = 1; // Redactions
        this.feedback = [
            "You trigger a localized lockdown around **{target}**, censoring their actions.",
            "Tonight, **{target}** will find their credentials redacted from the system.",
            "You've locked the security bulkhead on **{target}**.",
            "The transmissions of **{target}** will not leave their bunk tonight.",
            "You've placed a isolation stamp on the vitals of **{target}**.",
            "The sanctuary's strictest quarantine protocols now apply to **{target}**.",
            "You've edited out the possibility of **{target}** acting tonight.",
            "A heavy veil of censorship descends upon **{target}**.",
            "You've marked **{target}** for a mandatory period of isolation.",
            "The static you've jammed into **{target}**'s comms will not clear until dawn."
        ];
    }
}

class ThePlagiarist extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Plagiarist';
        this.faction = 'Revisions';
        this.emoji = '🃏';
        this.description = 'Godfather: Reads as an innocent Archivist to the Indexer. Serves as the primary executioner for the faction.';
        this.priority = 3; // Erasures
        this.feedback = [
            "You sharpen your tools, eager to silicate **{target}** from the sanctuary.",
            "Tonight, **{target}**'s vital signs will be flatlined.",
            "The Virus has spoken: **{target}** is the next to be silenced.",
            "You prepare the incinerator for **{target}**'s final chapter.",
            "One by one, the cells of **{target}** will vanish into grey static.",
            "You've marked **{target}** for a permanent logout.",
            "The silence in the library will be broken by **{target}**'s end.",
            "Tonight's infiltration requires the elimination of **{target}**.",
            "You've placed **{target}** on the path of the shredder's sensors.",
            "The forbidden rot calls for the sacrifice of **{target}**."
        ];
    }
}

class TheCorruptor extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Corruptor';
        this.faction = 'Revisions';
        this.emoji = '🩸';
        this.description = 'Cult Leader: Infects an Archivist with the Viral Rot at night (Specific to Ink Rot mode).';
        this.priority = 4; // Rewrites
        this.feedback = [
            "You inject corrupted nanites into **{target}**, slowly rewriting their DNA.",
            "Tonight, the Virus gains a new carrier: **{target}**.",
            "You've begun to twist the survival instincts of **{target}** to your advantage.",
            "The external world beckons **{target}** to join the grey static.",
            "You've marked **{target}** for a descent into the infected basement.",
            "Your whispers spread the Rot and truth in equal measure to **{target}**.",
            "The infection you've sown in **{target}** will soon bore through.",
            "You've started rewriting the allegiance of **{target}**.",
            "The Revisions grow stronger as you bind **{target}** to the viral ink.",
            "A drop of corrupted bile on **{target}**'s neck will change everything."
        ];
    }
}

class TheAnomaly extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Anomaly';
        this.faction = 'Unbound';
        this.emoji = '👁️';
        this.description = 'Jester: Wins if they successfully trick the town into Executing them during the Day phase.';
        this.priority = 99; // Passive
    }
}

class TheCritic extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Critic';
        this.faction = 'Unbound';
        this.emoji = '⚖️';
        this.description = 'Executioner: Assigned a specific Archivist at the start. Wins if the town Executes that target.';
        this.priority = 99; 
        this.targetId = null; // Assigned at deal
    }
}

class TheBookburner extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Bookburner';
        this.faction = 'Unbound';
        this.emoji = '🔥';
        this.description = 'Arsonist: Secretly saturates one player with toxins each night. Can choose to "Ignite" instead, erasing all saturated players simultaneously.';
        this.priority = 4; // Priming
        this.isReadyToIgnite = false;
        this.feedback_douse = [
            "The sanctuary's most dangerous chemicals now coat the skin of **{target}**.",
            "You've marked **{target}** as catalyst for your future masterpiece.",
            "A thin layer of corrosive-gel now coats the essence of **{target}**.",
            "Tonight, **{target}** becomes part of your grand, toxic design.",
            "The hidden toxins you've placed on **{target}** await the final spark.",
            "You've prepared the cell of **{target}** for your first and only reaction."
        ];
        this.feedback_ignite = [
            "You trigger the chemical reaction, and the sanctuary's ventilation erupts.",
            "The spark leaves your fingers, and your toxic design finally ignites.",
            "Tonight, the sanctuary burns from within, starting with those you've marked.",
            "The fire of your nihilism finally consumes the saturated survivors.",
            "One spark. One flame. A total erasure of the compromised.",
            "The smell of burning static fills the air as your chemicals react.",
            "Your masterpiece is finally complete in a roar of green fire and soot.",
            "The lower wings glow with the light of your retribution.",
            "They will remember this fire longer than any life you've saturated.",
            "The toxins you've spilled finally catch the long-awaited heat."
        ];
    }
}

// Export the catalog
module.exports = { 
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
};
