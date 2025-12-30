/**
 * Text direction utilities for Hebrew/German mixed content
 */

/**
 * Detect if text is primarily RTL (Hebrew/Arabic) or LTR (Latin/German)
 * Returns 'rtl' for Hebrew, 'ltr' for German/English
 */
export const detectTextDirection = (text: string): 'rtl' | 'ltr' => {
    if (!text || text.length === 0) return 'ltr';

    // Count Hebrew characters (Unicode range: U+0590 to U+05FF)
    const hebrewPattern = /[\u0590-\u05FF]/g;
    // Count Latin characters (a-z, A-Z, German umlauts, etc.)
    const latinPattern = /[a-zA-ZäöüÄÖÜß]/g;

    const hebrewMatches = text.match(hebrewPattern) || [];
    const latinMatches = text.match(latinPattern) || [];

    // If more Hebrew characters than Latin, use RTL
    return hebrewMatches.length >= latinMatches.length ? 'rtl' : 'ltr';
};

/**
 * Get CSS class for text alignment based on detected direction
 */
export const getTextAlignClass = (text: string): string => {
    return detectTextDirection(text) === 'rtl' ? 'text-right' : 'text-left';
};
