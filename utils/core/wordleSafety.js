/**
 * Wordle Safety Protocol: The "Moral Guardian".
 * Prevents sensitive, offensive, or inappropriate words from becoming daily ciphers.
 */
const SENSITIVE_WORDS = new Set([
    'SHOAH', 'SLAVE', 'ABUSE', 'BITCH', 'WHORE', 'SEXED', 'SEXES', 'SEXUAL', 
    'PENIS', 'VAGIN', 'FECES', 'URINE', 'BLOOD', 'DEATH', 'DYING', 'KILLED',
    'MURDER', 'FETUS', 'ABORT', 'ARABS', 'JEWISH', 'NEGRO', 'RACIST', 'NAZIS',
    'HITEL', 'STALIN', 'PUTIN', 'TRUMP', 'BIDEN', 'COKE', 'DRUGS', 'WHACK',
    'CRACK', 'POUND', 'SMOKE', 'SNORT', 'STERO', 'OPIUM', 'MORPH', 'GANJA',
    'FATTY', 'UGLY', 'IDIOT', 'STUPID', 'LOSER', 'MORON', 'BITCH', 'SHITT',
    'FUCKS', 'FUCKY', 'FUCKE', 'ASSES', 'ASHOY'
]);

/**
 * Checks if a word is safe for the general public archives.
 * @param {string} word 
 * @returns {boolean}
 */
function isSafeWord(word) {
    if (!word) return false;
    const normalized = word.toUpperCase();
    
    // 1. Direct Blacklist Check
    if (SENSITIVE_WORDS.has(normalized)) return false;

    // 2. Pattern Matching for common profanity/slurs
    const badPatterns = [
        /FUCK/i, /SHIT/i, /COCK/i, /DICK/i, /PUSS/i, /SLUT/i, /RAPE/i,
        /HELL/i, /DAMN/i, /GOD/i, /JESU/i, /CHRIST/i, /ALLAH/i
    ];

    for (const pattern of badPatterns) {
        if (pattern.test(normalized)) return false;
    }

    return true;
}

module.exports = { isSafeWord };
