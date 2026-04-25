/**
 * Arcade Protocol: Offline Word Archives.
 * A curated list of 5-letter English words to serve as a high-availability backup 
 * for the Wordle engine when external APIs are unreachable.
 */
const OFFLINE_DICTIONARY = [
    // Standard Common 5-Letter Words
    'ABUSE', 'ADULT', 'AGENT', 'ANGER', 'APPLE', 'AWARD', 'BASIC', 'BEACH', 'BIRTH', 'BLOCK',
    'BOARD', 'BRAIN', 'BREAD', 'BREAK', 'BROWN', 'BUYER', 'CAUSE', 'CHAIN', 'CHAIR', 'CHART',
    'CHECK', 'CHEST', 'CHIEF', 'CHILD', 'CHINA', 'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN',
    'CLEAR', 'CLICK', 'CLOCK', 'CLOSE', 'COACH', 'COAST', 'COURT', 'COVER', 'CREAM', 'CRIME',
    'CROSS', 'CROWD', 'CROWN', 'CYCLE', 'DAILY', 'DANCE', 'DEATH', 'DEPTH', 'DIRTY', 'DOUBT',
    'DRAFT', 'DRAMA', 'DREAM', 'DRESS', 'DRINK', 'DRIVE', 'EARTH', 'ENEMY', 'ENTRY', 'ERROR',
    'EVENT', 'FAITH', 'FAULT', 'FIELD', 'FIGHT', 'FINAL', 'FLOOR', 'FOCUS', 'FORCE', 'FRAME',
    'FRANK', 'FRONT', 'FRUIT', 'GLASS', 'GRANT', 'GRASS', 'GREEN', 'GROUP', 'GUIDE', 'HEART',
    'HENRY', 'HORSE', 'HOTEL', 'HOUSE', 'IMAGE', 'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JAPAN',
    'JONES', 'JUDGE', 'KNIFE', 'LAURA', 'LAYER', 'LEVEL', 'LEWIS', 'LIGHT', 'LIMIT', 'LUNCH',
    'MAGIC', 'MAJOR', 'MARCH', 'MATCH', 'METAL', 'MODEL', 'MONEY', 'MONTH', 'MOTOR', 'MOUTH',
    'MUSIC', 'NIGHT', 'NOISE', 'NORTH', 'NOVEL', 'NURSE', 'OFFER', 'ORDER', 'OTHER', 'OWNER',
    'PANEL', 'PAPER', 'PARTY', 'PEACE', 'PETER', 'PHASE', 'PHONE', 'PHOTO', 'PIECE', 'PILOT',
    'PITCH', 'PLACE', 'PLANE', 'PLANT', 'PLATE', 'POINT', 'POUND', 'POWER', 'PRESS', 'PRICE',
    'PRIDE', 'PRIZE', 'PROOF', 'QUEEN', 'RADIO', 'RANGE', 'RATIO', 'REPLY', 'RIGHT', 'RIVER',
    'ROUND', 'ROUTE', 'RUGBY', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE', 'SHAPE', 'SHARE',
    'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORE', 'SHORT', 'SIGHT',
    'SKILL', 'SLEEP', 'SMILE', 'SMITH', 'SMOKE', 'SOUND', 'SOUTH', 'SPACE', 'SPEED', 'SPEND',
    'SPORT', 'STAFF', 'STAGE', 'STAKE', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK', 'STILL',
    'STOCK', 'STONE', 'STORE', 'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'TABLE', 'TASTE', 'TERRY',
    'THEME', 'THING', 'TITLE', 'TOTAL', 'TOUCH', 'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TRUST',
    'TRUTH', 'UNCLE', 'UNION', 'UNITY', 'VALUE', 'VIDEO', 'VISIT', 'VOICE', 'WASTE', 'WATCH',
    'WATER', 'WHILE', 'WHITE', 'WHOLE', 'WOMAN', 'WORLD', 'WRITE', 'YOUTH',

    // Themed Words (Anime/Gaming)
    'MANGA', 'ANIME', 'OTAKU', 'GEASS', 'MECHA', 'KUNAI', 'NINJA', 'TITAN', 'GHOUL', 'SAIYAN',
    'SWORD', 'MAGIC', 'SPELL', 'DEMON', 'QUEST', 'BLOOD', 'WITCH', 'REALM', 'FAIRY', 'BEAST',
    'SHINE', 'BLAZE', 'FLARE', 'STORM', 'PULSE', 'PIRAT', 'PILOT', 'STEEL', 'SLASH', 'BRAVE'
];

/**
 * Checks if a word exists in the offline dictionary.
 * @param {string} word 
 * @returns {boolean}
 */
function isWordInOfflineArchive(word) {
    if (!word) return false;
    return OFFLINE_DICTIONARY.includes(word.toUpperCase());
}

/**
 * Picks a random 5-letter word from the archive.
 * @returns {string}
 */
function getRandomOfflineWord() {
    return OFFLINE_DICTIONARY[Math.floor(Math.random() * OFFLINE_DICTIONARY.length)];
}

module.exports = {
    OFFLINE_DICTIONARY,
    isWordInOfflineArchive,
    getRandomOfflineWord
};
