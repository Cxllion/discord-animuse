class Role {
    constructor(player) {
        this.player = player;
        this.name = 'Unknown';
        this.faction = 'Unknown';
        this.description = '';
        this.priority = 0; // Lower number = resolves first
        this.vote_feedback = [
            "You've officially called for the erasure of **{target}**.",
            "Your vote is now indexed against **{target}**'s records.",
            "The Archive recorded your judgment: **{target}** must go.",
            "You've cast your ballot, sentencing **{target}** to the shredder.",
            "The library's balance demands it: you've voted for **{target}**.",
            "You've marked **{target}** for a permanent redaction today.",
            "Your fingerprint is now on the case against **{target}**.",
            "You've spoken your truth: **{target}** is the one who must be erased.",
            "The Archive's weight is behind your call for **{target}**'s removal.",
            "You've turned the page on **{target}**, voting for their exile."
        ];
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
            "You find a quiet corner of the library to contemplate your next move.",
            "You spend the night indexing regular shelf space, staying vigilant.",
            "The library's silence is comforting to a humble Archivist like you.",
            "You've decided to trust your instincts and monitor the Archive.",
            "Tonight, you're just another page in the vast collection of history.",
            "You've chosen to stay safe in the well-lit sections of the library.",
            "A quiet night of study is exactly what you needed.",
            "You've marked down some observations for tomorrow's discussion.",
            "The Archive's weight of history feels heavy on your shoulders tonight.",
            "You've accepted your role as a witness to the evolving story."
        ];
    }
}

class Revision extends Role {
    constructor(player) {
        super(player);
        this.name = 'Revision';
        this.faction = 'Revisions';
        this.emoji = '🔪';
        this.description = 'Vanilla Revision. Vote with your faction at night.';
        this.priority = 99;
        this.feedback = [
            "You blend into the shadows, waiting for your faction's command.",
            "The Revisions hum a dark tune in your ear as you wait.",
            "Tonight, the ink of the library feels thicker and more potent.",
            "You've decided to keep your head down and wait for the signal.",
            "A drop of black ink falls from your pen as you plan with your team.",
            "The shadows of the Archive are your greatest ally tonight.",
            "You've marked down a potential target for the faction's next edit.",
            "Tonight, you're the silent author of the library's demise.",
            "The Archive's history is about to be violently rewritten.",
            "You've committed yourself fully to the cause of the Revisions."
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
            "You bind **{target}** in protective parchment, shielding them from erasure.",
            "Your ink flows into **{target}**, sealing their fate against the dark.",
            "The library's whispers guide your hands to preserve **{target}**'s story.",
            "You've marked **{target}** as a protected volume in the Archive tonight.",
            "The Restricted Section's wards now extend to **{target}**.",
            "You weave a safety seal around **{target}**'s core essence.",
            "Tonight, the shredded pages of **{target}** shall not be found.",
            "A ghostly librarian watches over **{target}** at your command.",
            "You've indexed **{target}** as 'Indestructible' for the night.",
            "The Archive's oldest bindings wrap **{target}** in a safe embrace."
        ];
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
            "You sharpen your blade, eager to redact **{target}** from history.",
            "Tonight, **{target}**'s pages will be scattered to the wind.",
            "The Revisions have spoken: **{target}** is the next to be erased.",
            "You prepare the shredder for **{target}**'s final chapter.",
            "One by one, the words of **{target}** will vanish into black ink.",
            "You've marked **{target}** for a permanent deletion.",
            "The silence in the library will be broken by **{target}**'s fall.",
            "Tonight's rewrite requires the blood of **{target}**.",
            "You've placed **{target}** on the path of the shredder's blade.",
            "The forbidden ink calls for the sacrifice of **{target}**."
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
            "You carefully index the spine of **{target}**, looking for hidden marks.",
            "The Archive's catalog hums as you cross-reference **{target}**'s history.",
            "You peel back the cover of **{target}** to reveal their true alignment.",
            "Tonight, the mysteries of **{target}** will be indexed in your records.",
            "You've focused your lens on **{target}**'s most hidden chapters.",
            "The whispers of the library reveal the ink-scent of **{target}**.",
            "Every bookmark and marginalia of **{target}** is now under your scrutiny.",
            "You've begun a deep research session into the essence of **{target}**.",
            "The Archive's truth-seals glow as you examine **{target}**.",
            "By dawn, you will know exactly where **{target}** fits in the library."
        ];
    }
}

class ThePlurality extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Plurality';
        this.faction = 'Archivists';
        this.emoji = '👑';
        this.description = 'Mayor: Their vote counts as two during the Day phase.';
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
            "You dip your pen in righteous ink, preparing to rewrite **{target}** out.",
            "Tonight, you take the role of executioner, targeting **{target}**'s pages.",
            "You've decided that **{target}**'s presence in this Archive must end.",
            "The heavy responsibility of the Ghostwriter falls upon **{target}** tonight.",
            "You've prepared a final, violent redaction for **{target}**.",
            "The library's balance demands the removal of **{target}**, and you agree.",
            "You've begun writing the final paragraph in **{target}**'s biography.",
            "A strike of your pen will soon erase **{target}** from the table of contents.",
            "Tonight, you deliver the Archive's harshest judgement to **{target}**.",
            "You've set your sights on **{target}**, hoping your pen remains true."
        ];
    }
}

class TheScribe extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Scribe';
        this.faction = 'Archivists';
        this.emoji = '🖋️';
        this.description = 'Forensic Medium: Checks a dead body at night to find one random person who interacted with them. Becomes Ink-Bound and cannot vote for that suspect next Day.';
        this.priority = 5; // Readings
        this.feedback = [
            "You kneel beside the ink-trail, tracing the visitors of **{target}**.",
            "The former essence of **{target}** begins to whisper its secrets to you.",
            "You use your scribe's intuition to see who last touched **{target}**.",
            "Tonight, the history of **{target}** will be written in your blood-ink.",
            "You've begun a ritual to summon the shadows that haunted **{target}**.",
            "The Archive's memory of **{target}** is vivid and treacherous.",
            "You've bound your quill to the fate of **{target}**'s former shelf.",
            "Tracing the spine of the fallen, you seek the identity of **{target}**'s visitor.",
            "The echoes of the library reveal the last hands to touch **{target}**.",
            "You've started scribing the hidden truth behind **{target}**'s end."
        ];
    }
}

class TheCensor extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Censor';
        this.faction = 'Revisions';
        this.emoji = '🔇';
        this.description = 'Roleblocker: Redacts a player at night, stopping their ability.';
        this.priority = 1; // Redactions
        this.feedback = [
            "You smear ink across **{target}**'s latest chapter, censoring their actions.",
            "Tonight, **{target}** will find their ability redacted from existence.",
            "You've locked the Restricted Section door on **{target}**.",
            "The words of **{target}** will not leave the page tonight.",
            "You've placed a silencing stamp on the essence of **{target}**.",
            "The Archive's strictest rules now apply to **{target}**.",
            "You've edited out the possibility of **{target}** acting tonight.",
            "A heavy veil of censorship descends upon **{target}**.",
            "You've marked **{target}** for a mandatory period of silence.",
            "The ink you've poured on **{target}**'s hands will not dry until dawn."
        ];
    }
}

class ThePlagiarist extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Plagiarist';
        this.faction = 'Revisions';
        this.emoji = '🃏';
        this.description = 'Godfather: Reads as an innocent Archivist to the Indexer.';
        this.priority = 99; // Passive
    }
}

class TheCorruptor extends Role {
    constructor(player) {
        super(player);
        this.name = 'The Corruptor';
        this.faction = 'Revisions';
        this.emoji = '🩸';
        this.description = 'Cult Leader: Recruits an Archivist into a Revision at night (Specific to Ink Rot mode).';
        this.priority = 4; // Rewrites
        this.feedback = [
            "You inject corrupted ink into **{target}**, slowly rewriting their soul.",
            "Tonight, the Revisions gain a new author: **{target}**.",
            "You've begun to twist the story of **{target}** to your advantage.",
            "The library's dark history beckons **{target}** to join your ranks.",
            "You've marked **{target}** for a descent into the forgotten wing.",
            "Your ink whispers lies and truths in equal measure to **{target}**.",
            "The corruption you've sown in **{target}** will soon bear fruit.",
            "You've started rewriting the allegiance of **{target}**.",
            "The Revisions grow stronger as you bind **{target}** to the dark ink.",
            "A drop of blood-ink on **{target}**'s spine will change everything."
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
        this.description = 'Arsonist: Secretly douses one player each night. Can choose to "Ignite" instead, erasing all doused players simultaneously.';
        this.priority = 3; // Erasures
        this.isReadyToIgnite = false;
        this.feedback_douse = [
            "You splash volatile oil-ink onto **{target}**, preparing them for the spark.",
            "Tonight, you've secretly prepared **{target}** for a glorious blaze.",
            "A faint smell of kerosene now lingers on the pages of **{target}**.",
            "You've indexed **{target}** as 'Highly Flammable' in your secret notes.",
            "The Archive's most dangerous ink now coats the spine of **{target}**.",
            "You've marked **{target}** as fuel for your future masterpiece.",
            "A thin layer of dousing-gel now coats the essence of **{target}**.",
            "Tonight, **{target}** becomes part of your grand, fiery design.",
            "The hidden oil you've placed on **{target}** awaits the final light.",
            "You've prepared the canvas of **{target}** for your first and only spark."
        ];
        this.feedback_ignite = [
            "You strike a single match, and the Archive's forgotten wing erupts.",
            "The spark leaves your fingers, and your grand design finally ignites.",
            "Tonight, the library burns, starting with those you've marked.",
            "The fire of your ambition finally consumes the doused pages.",
            "One spark. One flame. A total erasure of the indexed.",
            "The smell of burning parchment fills the air as your oil ignites.",
            "Your masterpiece is finally complete in a roar of orange and soot.",
            "The Restricted Section glows with the light of your retribution.",
            "They will remember this fire longer than any book you've doused.",
            "The ink you've spilled finally catches the long-awaited heat."
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
    ThePlurality,
    TheGhostwriter,
    TheScribe,
    TheCensor,
    ThePlagiarist,
    TheCorruptor,
    TheAnomaly,
    TheCritic,
    TheBookburner
};
