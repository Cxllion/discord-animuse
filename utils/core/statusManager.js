const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

const statusFilePath = path.join(process.cwd(), 'data', 'maintenance.json');

// Themed Presets - Library / Muse Theme
const THEMED_OFFLINE_PRESETS = [
    {
        title: "📚 Library Reorganization",
        description: "The Managers are currently cataloging new entries in the Forbidden Wing. Access to the records is temporarily restricted."
    },
    {
        title: "🖋️ Drying Ink",
        description: "We are waiting for the ink to dry on our latest scrolls. The Scriptorium should be open again shortly."
    },
    {
        title: "🏗️ Structural Restoration",
        description: "A stack of ancient books collapsed and blocked the main entrance! Our archivists are digging their way out."
    },
    {
        title: "🕰️ Temporal Synchronization",
        description: "The Library is synchronizing with the Library Records. Please wait while we align the timelines."
    },
    {
        title: "🧹 Dusting the Library",
        description: "A deep cleaning is in progress. The dust from the beginning of time is quite hard to remove."
    },
    {
        title: "🌬️ Echoes of Knowledge",
        description: "The Library is currently sealed for safety. The Echoes are a bit too loud and chaotic today."
    },
    {
        title: "🍵 Archivist's Tea Time",
        description: "All archivists are currently on break, enjoying some tea and a quiet scroll through the stars."
    },
    {
        title: "🔐 The Great Gates are Sealed",
        description: "The Library is currently closed following the Council's orders for structural reinforcement."
    },
    {
        title: "🦉 The Librarian is Away",
        description: "The Great Librarian is attending a meeting in the High Heavens; please return when the Council of Light adjourns."
    },
    {
        title: "📜 Restoring Old Records",
        description: "We are currently enchanting the older scrolls to prevent them from disintegrating. Access is limited during this process."
    },
    {
        title: "🌑 Silent Re-indexing",
        description: "Shh! We are currently re-indexing the Soul Records in absolute silence. Please return later when the spirits have calmed."
    },
    {
        title: "🌌 Celestial Alignment",
        description: "The Library is undergoing a celestial alignment. The connection between worlds is unstable for public access."
    },
    {
        title: "🔥 Burning the Midnight Oil",
        description: "The managers are working overtime in the back office. The main desk is currently unattended."
    },
    {
        title: "🧵 Mending the Threads",
        description: "The threads of fate in the Weaver's Section have tangled. We are carefully unknotting them one by one."
    },
    {
        title: "🗝️ Misplaced Key",
        description: "Someone misplaced the key to the main gates in a bottomless pit. We've sent a rescue squad to retrieve it."
    },
    {
        title: "🖋️ Recalibrating Quill Pens",
        description: "Our enchanted quills are writing in backwards runes today. We're currently recalibrating them to common speech."
    },
    {
        title: "📖 Re-binding Ancient Tomes",
        description: "A few of the heavier books are losing their bindings. We're currently applying fresh magic adhesive."
    },
    {
        title: "🌌 Celestial Reshelving",
        description: "The Star Charts require alignment with the current night sky. The Library is closed while we shift the constellations."
    },
    {
        title: "🕯️ Lit by Enchanted Candlelight",
        description: "The main lanterns have run out of oil. We are currently summoning new eternal flames to light the corridors."
    },
    {
        title: "📜 Scroll Worm Control",
        description: "A minor infestation of hungry scroll-worms has been detected. Please wait while our familiars clear the shelves."
    }
];

class StatusManager {
    constructor() {
        this.maintenance = false;
        this.loadStatus();
    }

    loadStatus() {
        try {
            if (fs.existsSync(statusFilePath)) {
                const data = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
                this.maintenance = data.maintenance || false;
            }
        } catch (err) {
            logger.error('Failed to load maintenance status:', err, 'Status');
            this.maintenance = false;
        }
    }

    saveStatus() {
        try {
            const data = { maintenance: this.maintenance };
            fs.writeFileSync(statusFilePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            logger.error('Failed to save maintenance status:', err, 'Status');
        }
    }

    setMaintenance(value) {
        this.maintenance = !!value;
        this.saveStatus();
    }

    isMaintenance() {
        return this.maintenance;
    }

    getRandomPreset() {
        const randomIndex = Math.floor(Math.random() * THEMED_OFFLINE_PRESETS.length);
        return THEMED_OFFLINE_PRESETS[randomIndex];
    }

    createMaintenanceEmbed() {
        const baseEmbed = require('../generators/baseEmbed');
        const preset = this.getRandomPreset();
        // [Straightforward Header] + [Themed Title]
        return baseEmbed(`🛠️ [MAINTENANCE] ${preset.title}`, `${preset.description}\n\n**The Archival Mainframe is currently undergoing scheduled maintenance. Please check back shortly.** ♡`, null)
            .setColor(CONFIG.COLORS.GOLD || '#D4AF37');
    }

    createStartupEmbed() {
        const baseEmbed = require('../generators/baseEmbed');
        // [Straightforward Header] + [Themed Title]
        return baseEmbed("⏳ [STARTUP] The Library is Opening", 
            "Our archivists are currently unlocking the main gates and dusting the shelves.\n\n**Systems are initializing. We should be ready to serve you in a moment.** ♡", 
            null
        ).setColor(CONFIG.COLORS.INFO || '#3498DB');
    }
}

module.exports = new StatusManager();
