/**
 * MafiaLore.js
 * Thematic storytelling strings and visual assets for "The Final Library".
 */

module.exports = {
    // --- Visual Identity ---
    BANNERS: {
        NIGHT: "https://i.ibb.co/vzG7f0m/mafia-night-banner-1776503248630.png", // Mock hosted paths for now
        DAY: "https://i.ibb.co/7jSjX6y/mafia-day-banner-1776503276345.png",
        VOTING: "https://i.ibb.co/vzG7f0m/mafia-night-banner-1776503248630.png", // Placeholder
        TWILIGHT: "https://i.ibb.co/7jSjX6y/mafia-day-banner-1776503276345.png"  // Placeholder
    },

    COLORS: {
        NIGHT: "#1a1a2e",
        DAY: "#f39c12",
        VOTING: "#e74c3c",
        TWILIGHT: "#7f8c8d",
        LOBBY: "#8B5CF6",
        VICTORY_TOWN: "#2ecc71",
        VICTORY_MAFIA: "#e74c3c",
        VICTORY_NEUTRAL: "#f1c40f"
    },

    // --- Storytelling Engine ---
    STORY: {
        MORNING_QUIET: [
            "The library's internal clock ticks. No biological footprints were found in the dust today.",
            "The scanners show 100% integrity. For now, the archives are safe.",
            "A peaceful silence corridors. The Viral Rot was held at bay last night.",
            "Diagnostics report a clean sweep. No redactions detected in Sector 7."
        ],
        ERASURE_KILL: [
            "A pool of blackened ink marks the spot where **{name}** was violently taken. Their records are now empty.",
            "The internal scanners flatlined at 03:15. **{name}** has been unceremoniously redacted from the roster.",
            "A trail of fragmented data led to **{name}**'s terminal. No biometric signature remains.",
            "The ink has run dry for **{name}**. Their story ends here, unrecoverably erased.",
            "**{name}** was found near the lower vents, their physical form dissolved into digital static."
        ],
        ERASURE_GUILT: [
            "The weight of erasing an innocent colleague was too much for **{name}**. Their biometrics have flatlined from guilt overrides.",
            "Psychological safeguards failed for **{name}**. They have chosen self-redaction rather than live with their choices.",
            "A feedback loop of remorse triggered for **{name}**. They are no longer part of the surviving record."
        ],
        PROTECTION_SUCCESS: [
            "Archive shields deflected a lethal corruption attempt on **{name}**.",
            "A pulse of blue light shielded **{name}** from an erasure attempt.",
            "The Conservator manually overrode a deletion protocol for **{name}** just in time.",
            "Biometric stabilization successfully intercepted a kill-signal aimed at **{name}**."
        ],
        BLOCK_SUCCESS: [
            "A quarantine protocol was imposed on **{name}**. They spent the night in isolation, unable to interact.",
            "**{name}**'s terminal was forcibly locked by the Censor. Their night actions were redacted.",
            "Data interference prevented **{name}** from executing their assigned night tasks."
        ],
        INFECTION_SUCCESS: [
            "The Viral Rot has spread. A new signature has been rewritten in the Revision's image.",
            "Ink corruption was detected in the DMs. A survivor has been compromised.",
            "The database has been silently altered. One more record now belongs to the Revisions."
        ],
        EXILE_TEXT: [
            "The council has reached consensus. **{name}** is escorted to the airlock for permanent redaction.",
            "With a heavy heart, the council votes to expunge **{name}** from the sanctuary's memory.",
            "Consensus: **{name}** is a threat. Their biometrics are being deactivated as we speak.",
            "The archives have no room for suspect signatures. **{name}** is redacted."
        ],
        REVISIONS_WIN: [
            "The sanctuary's mainframes pulse crimson. The remaining Archivists are systematically locked out of the safe zones. The Viral Rot has won.",
            "Silent alarms scream through empty corridors. The Revisions have achieved numerical superiority. The final records are being overwritten.",
            "A total archival breach. The remaining indexers are suffocated as the vents flood with digital static. The sanctuary belongs to the corruption.",
            "Security doors seal the remaining Archivists inside. The Revisions watch the monitors as the final purging sequence begins."
        ],
        TOWN_WIN: [
            "The air filtration hums softly. The final corrupted signature has been erased. The sanctuary holds.",
            "The viral threat reads 0%. The remaining Archivists exhale a shared breath of relief. Humanity's history is safe.",
            "The quarantine lifts. The corrupted have been purged from the logs. For the first time in an age, the library is secure."
        ],
        UNBOUND_WIN: [
            "Chaos protocol achieved. An irregularity in the system has superseded all directives.",
            "The sanctuary burns from within. An Unbound signature outlasted the system."
        ]
    }
};
