/**
 * Local Sefaria Data Utility
 * 
 * Uses locally downloaded Sefaria-Export JSON files to fetch Talmudic texts
 * without making API calls. Falls back to API if local data is unavailable.
 * 
 * Data source: https://github.com/Sefaria/Sefaria-Export
 * Structure: /sefaria-data/json/Talmud/Bavli/{Seder}/{Tractate}/{Hebrew|English}/merged.json
 */

import { SefariaText } from './sefaria';

// Cache for loaded tractate data (stores both Hebrew and English)
interface TractateData {
    hebrew: any;
    english: any;
}
const tractateCache: Map<string, TractateData> = new Map();

// Mapping of tractates to their Seder (order)
const TRACTATE_TO_SEDER: Record<string, string> = {
    // Seder Zeraim
    'Berakhot': 'Seder Zeraim',

    // Seder Moed
    'Shabbat': 'Seder Moed',
    'Eruvin': 'Seder Moed',
    'Pesachim': 'Seder Moed',
    'Shekalim': 'Seder Moed',
    'Yoma': 'Seder Moed',
    'Sukkah': 'Seder Moed',
    'Beitzah': 'Seder Moed',
    'Rosh Hashanah': 'Seder Moed',
    'Taanit': 'Seder Moed',
    'Megillah': 'Seder Moed',
    'Moed Katan': 'Seder Moed',
    'Chagigah': 'Seder Moed',

    // Seder Nashim
    'Yevamot': 'Seder Nashim',
    'Ketubot': 'Seder Nashim',
    'Nedarim': 'Seder Nashim',
    'Nazir': 'Seder Nashim',
    'Sotah': 'Seder Nashim',
    'Gittin': 'Seder Nashim',
    'Kiddushin': 'Seder Nashim',

    // Seder Nezikin
    'Bava Kamma': 'Seder Nezikin',
    'Bava Metzia': 'Seder Nezikin',
    'Bava Batra': 'Seder Nezikin',
    'Sanhedrin': 'Seder Nezikin',
    'Makkot': 'Seder Nezikin',
    'Shevuot': 'Seder Nezikin',
    'Avodah Zarah': 'Seder Nezikin',
    'Horayot': 'Seder Nezikin',

    // Seder Kodashim
    'Zevachim': 'Seder Kodashim',
    'Menachot': 'Seder Kodashim',
    'Chullin': 'Seder Kodashim',
    'Bekhorot': 'Seder Kodashim',
    'Arakhin': 'Seder Kodashim',
    'Temurah': 'Seder Kodashim',
    'Keritot': 'Seder Kodashim',
    'Meilah': 'Seder Kodashim',
    'Tamid': 'Seder Kodashim',

    // Seder Tahorot
    'Niddah': 'Seder Tahorot',
};

// Mapping of common tractate name variations to canonical names
const TRACTATE_ALIASES: Record<string, string> = {
    'berakhot': 'Berakhot',
    'berachot': 'Berakhot',
    'brachot': 'Berakhot',
    'shabbat': 'Shabbat',
    'shabbos': 'Shabbat',
    'eruvin': 'Eruvin',
    'eiruvin': 'Eruvin',
    'pesachim': 'Pesachim',
    'pesahim': 'Pesachim',
    'shekalim': 'Shekalim',
    'yoma': 'Yoma',
    'sukkah': 'Sukkah',
    'succah': 'Sukkah',
    'beitzah': 'Beitzah',
    'beitza': 'Beitzah',
    'rosh hashanah': 'Rosh Hashanah',
    'rosh hashana': 'Rosh Hashanah',
    'taanit': 'Taanit',
    'taanis': 'Taanit',
    'megillah': 'Megillah',
    'megila': 'Megillah',
    'moed katan': 'Moed Katan',
    'chagigah': 'Chagigah',
    'hagigah': 'Chagigah',
    'yevamot': 'Yevamot',
    'yevamos': 'Yevamot',
    'ketubot': 'Ketubot',
    'ketubos': 'Ketubot',
    'nedarim': 'Nedarim',
    'nazir': 'Nazir',
    'sotah': 'Sotah',
    'sota': 'Sotah',
    'gittin': 'Gittin',
    'gitin': 'Gittin',
    'kiddushin': 'Kiddushin',
    'kidushin': 'Kiddushin',
    'bava kamma': 'Bava Kamma',
    'baba kama': 'Bava Kamma',
    'bava metzia': 'Bava Metzia',
    'baba metzia': 'Bava Metzia',
    'bava batra': 'Bava Batra',
    'baba batra': 'Bava Batra',
    'sanhedrin': 'Sanhedrin',
    'makkot': 'Makkot',
    'makot': 'Makkot',
    'shevuot': 'Shevuot',
    'shevuos': 'Shevuot',
    'avodah zarah': 'Avodah Zarah',
    'avoda zara': 'Avodah Zarah',
    'horayot': 'Horayot',
    'horayos': 'Horayot',
    'zevachim': 'Zevachim',
    'zevahim': 'Zevachim',
    'menachot': 'Menachot',
    'menahot': 'Menachot',
    'chullin': 'Chullin',
    'hullin': 'Chullin',
    'bekhorot': 'Bekhorot',
    'bechoros': 'Bekhorot',
    'arakhin': 'Arakhin',
    'archin': 'Arakhin',
    'temurah': 'Temurah',
    'keritot': 'Keritot',
    'kerisos': 'Keritot',
    'meilah': 'Meilah',
    'meila': 'Meilah',
    'kinnim': 'Kinnim',
    'tamid': 'Tamid',
    'middot': 'Middot',
    'niddah': 'Niddah',
    'nidah': 'Niddah',
};

/**
 * Parse a Talmudic reference into its components
 * Examples: "Shabbat 31a", "Bavli Kiddushin 40b", "Sanhedrin 37a-b"
 */
export function parseRef(ref: string): { tractate: string; daf: number; amud: 'a' | 'b' } | null {
    // Clean the reference
    const cleanRef = ref
        .replace(/^(Talmud\s+)?(Bavli|Yerushalmi|Masechet|Tractate|b\.|y\.)\s*/i, '')
        .replace(/,/g, '')
        .trim();

    // Match tractate name and daf/amud
    const match = cleanRef.match(/^(.+?)\s+(\d+)([ab])?/i);
    if (!match) {
        console.warn(`[Sefaria Local] Could not parse ref: "${ref}"`);
        return null;
    }

    const rawTractate = match[1].toLowerCase().trim();
    const daf = parseInt(match[2], 10);
    const amud = (match[3]?.toLowerCase() || 'a') as 'a' | 'b';

    // Normalize tractate name
    const tractate = TRACTATE_ALIASES[rawTractate] ||
        rawTractate.charAt(0).toUpperCase() + rawTractate.slice(1);

    return { tractate, daf, amud };
}

/**
 * Load a tractate's JSON data from local files
 * Loads both Hebrew and English from separate files
 */
async function loadTractate(tractate: string): Promise<TractateData | null> {
    // Check cache first
    if (tractateCache.has(tractate)) {
        return tractateCache.get(tractate)!;
    }

    const seder = TRACTATE_TO_SEDER[tractate];
    if (!seder) {
        console.warn(`[Sefaria Local] Unknown tractate: ${tractate}`);
        return null;
    }

    try {
        const basePath = `/sefaria-data/json/Talmud/Bavli/${seder}/${tractate}`;

        console.log(`[Sefaria Local] Loading ${tractate} from ${seder}...`);

        // Load Hebrew and English in parallel
        const [hebrewRes, englishRes] = await Promise.all([
            fetch(`${basePath}/Hebrew/merged.json`),
            fetch(`${basePath}/English/merged.json`)
        ]);

        if (!hebrewRes.ok && !englishRes.ok) {
            console.warn(`[Sefaria Local] Tractate not found: ${tractate}`);
            return null;
        }

        const data: TractateData = {
            hebrew: hebrewRes.ok ? await hebrewRes.json() : null,
            english: englishRes.ok ? await englishRes.json() : null
        };

        tractateCache.set(tractate, data);
        console.log(`[Sefaria Local] Loaded ${tractate} (cached)`);
        return data;
    } catch (error) {
        console.warn(`[Sefaria Local] Failed to load ${tractate}:`, error);
        return null;
    }
}

/**
 * Flatten nested text arrays and strip HTML
 */
function processText(text: any): string {
    if (!text) return '';

    const flatten = (t: any): string[] => {
        if (!t) return [];
        if (typeof t === 'string') return [t];
        if (Array.isArray(t)) return t.flatMap(item => flatten(item));
        return [];
    };

    return flatten(text)
        .filter(segment => typeof segment === 'string')
        .map(segment => segment.replace(/<[^>]*>?/gm, '')) // Strip HTML
        .join(' ')
        .trim();
}

/**
 * Get text from local Sefaria data
 * Returns null if the text is not available locally
 */
export async function getLocalTalmudText(ref: string): Promise<SefariaText | null> {
    const parsed = parseRef(ref);
    if (!parsed) return null;

    const { tractate, daf, amud } = parsed;
    const data = await loadTractate(tractate);
    if (!data) return null;

    try {
        // Talmud uses daf numbers where:
        // - Daf 2a = chapter index 0 (first daf is always 2)
        // - Daf 2b = chapter index 1
        // - Daf 3a = chapter index 2
        // etc.
        const chapterIndex = (daf - 2) * 2 + (amud === 'b' ? 1 : 0);

        if (chapterIndex < 0) {
            console.warn(`[Sefaria Local] Invalid daf: ${daf}${amud}`);
            return null;
        }

        // Get text from the loaded data
        const hebrewText = data.hebrew?.text?.[chapterIndex]
            ? processText(data.hebrew.text[chapterIndex])
            : '';
        const translation = data.english?.text?.[chapterIndex]
            ? processText(data.english.text[chapterIndex])
            : '';

        if (!hebrewText && !translation) {
            console.warn(`[Sefaria Local] No text at ${tractate} ${daf}${amud} (index ${chapterIndex})`);
            return null;
        }

        console.log(`[Sefaria Local] Found text for ${tractate} ${daf}${amud}`);

        return {
            hebrewText,
            translation,
            ref: `${tractate} ${daf}${amud}` // Canonical ref
        };
    } catch (error) {
        console.error(`[Sefaria Local] Error extracting text for ${ref}:`, error);
        return null;
    }
}

/**
 * Check if local Sefaria data is available
 */
export async function isLocalDataAvailable(): Promise<boolean> {
    try {
        // Try to load Berakhot as a test (it's in Seder Zeraim)
        const response = await fetch('/sefaria-data/json/Talmud/Bavli/Seder Zeraim/Berakhot/Hebrew/merged.json', {
            method: 'HEAD'
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get statistics about cached tractates
 */
export function getCacheStats(): { cachedTractates: string[]; count: number } {
    return {
        cachedTractates: Array.from(tractateCache.keys()),
        count: tractateCache.size
    };
}

/**
 * Clear the tractate cache (useful for testing or memory management)
 */
export function clearCache(): void {
    tractateCache.clear();
    console.log('[Sefaria Local] Cache cleared');
}
