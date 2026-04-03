const baseEmbed = require('./baseEmbed');

/**
 * Generates a themed Archival Audit Log embed.
 * 
 * @param {string} title - Action Title (e.g., 'Message Deleted')
 * @param {string} description - Detailed context
 * @param {string} type - 'INFO', 'ACTION', 'ALERT' (controls color)
 * @param {Object} author - { name, iconURL }
 * @returns {EmbedBuilder}
 */
const generateLogEmbed = (title, description, type = 'INFO', author = null) => {
    const colors = {
        INFO: '#A78BFA',    // Purple
        ACTION: '#FBBF24',  // Amber
        ALERT: '#F87171'    // Red
    };

    const lables = {
        INFO: '📁 Discovery',
        ACTION: '📝 Modification',
        ALERT: '🚨 Alert'
    };

    const embed = baseEmbed(`${lables[type] || '📚'}: ${title}`, description, null)
        .setColor(colors[type] || '#A78BFA')
        .setTimestamp();

    if (author) {
        embed.setAuthor(author);
    }

    // Archival Librarian Note
    const archivalNotes = [
        "The ink is forever dry on these records. ♡",
        "Observing the Grand Library's ever-shifting volumes. ✨",
        "Every change is a new chapter in our history. 📜",
        "Preserving order in the archives. 🏛️",
        "Quiet auditing in progress... ♡"
    ];
    
    embed.setFooter({ 
        text: `Archival Note: ${archivalNotes[Math.floor(Math.random() * archivalNotes.length)]}`
    });

    return embed;
};

module.exports = { generateLogEmbed };
