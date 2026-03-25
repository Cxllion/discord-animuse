const loadingMessages = {
    GENERIC: [
        "Consulting the Archivist... 📚",
        "Fetching data from the Main Hall... 🏛️",
        "Unrolling the scrolls... 📜",
        "Dusting off the records... 🧹",
        "Searching the Index... 🔍",
        "Asking the Librarian... 👓",
        "Retrieving from the shelves... 📖",
        "Sorting the archives... 📂"
    ],
    BINGO: [
        "Sketching your canvas... 🎨",
        "Mixing the perfect colors... 🖌️",
        "Arranging the tiles... 🧩",
        "Designing the grid... 📐",
        "Selecting the covers... 🖼️",
        "Polishing the pixels... 💎",
        "Constructing your challenge... 🏗️",
        "Aligning the stars... ✨",
        "Weaving the layout... 🧶",
        "Preparing the showcase... 🎭"
    ]
};

const getLoadingMessage = (type = 'GENERIC') => {
    const pool = loadingMessages[type] || loadingMessages['GENERIC'];
    return pool[Math.floor(Math.random() * pool.length)];
};

module.exports = {
    loadingMessages,
    getLoadingMessage
};
