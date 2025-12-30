/**
 * Dictionary of common Talmudic tractate spelling variations mapped to their canonical English names.
 * Based on Sefaria's canonical spellings.
 */
const TRACTATE_MAPPINGS: Record<string, string> = {
    // Zeraim
    "berakhot": "Berakhot", "berachot": "Berakhot", "brachot": "Berakhot",
    "peah": "Peah",
    "demai": "Demai",
    "kilayim": "Kilayim",
    "sheviit": "Sheviit", "shevi'it": "Sheviit",
    "terumot": "Terumot",
    "maasrot": "Maasrot", "ma'asrot": "Maasrot",
    "maaser sheni": "Maaser Sheni", "ma'aser sheni": "Maaser Sheni",
    "challah": "Challah", "challa": "Challah",
    "orlah": "Orlah",
    "bikkurim": "Bikkurim",

    // Moed
    "shabbat": "Shabbat", "shabbos": "Shabbat",
    "eruvin": "Eruvin",
    "pesachim": "Pesachim", "pesahim": "Pesachim",
    "shekalim": "Shekalim",
    "yoma": "Yoma",
    "sukkah": "Sukkah", "sukka": "Sukkah",
    "beitzah": "Beitzah", "beitza": "Beitzah", "betsa": "Beitzah",
    "rosh hashanah": "Rosh Hashanah", "rosh hashana": "Rosh Hashanah",
    "taanit": "Taanit", "ta'anit": "Taanit",
    "megillah": "Megillah", "megilla": "Megillah",
    "moed katan": "Moed Katan", "mo'ed katan": "Moed Katan",
    "chagigah": "Chagigah", "chagiga": "Chagigah",

    // Nashim
    "yevamot": "Yevamot",
    "ketubot": "Ketubot", "ketuboth": "Ketubot",
    "nedarim": "Nedarim",
    "nazir": "Nazir",
    "sotah": "Sotah", "sota": "Sotah",
    "gittin": "Gittin",
    "kiddushin": "Kiddushin",

    // Nezikin
    "bava kamma": "Bava Kamma", "bava kama": "Bava Kamma", "baba kamma": "Bava Kamma", "baba kama": "Bava Kamma",
    "bava metzia": "Bava Metzia", "bava metsia": "Bava Metzia", "baba metzia": "Bava Metzia",
    "bava batra": "Bava Batra", "baba batra": "Bava Batra",
    "sanhedrin": "Sanhedrin",
    "makkot": "Makkot", "makot": "Makkot",
    "shevuot": "Shevuot",
    "eduyot": "Eduyot",
    "avodah zarah": "Avodah Zarah", "avoda zara": "Avodah Zarah", "avodah zara": "Avodah Zarah",
    "avot": "Avot", "pirkei avot": "Avot",
    "horayot": "Horayot",

    // Kodashim
    "zevachim": "Zevachim",
    "menachot": "Menachot",
    "chullin": "Chullin", "hullin": "Chullin",
    "bekhorot": "Bekhorot", "bechorot": "Bekhorot",
    "arakhin": "Arakhin",
    "temurah": "Temurah",
    "keritot": "Keritot",
    "meilah": "Meilah",
    "tamid": "Tamid",
    "middot": "Middot",
    "kinnim": "Kinnim",

    // Tahorot
    "kelim": "Kelim",
    "oholei": "Oholot", "oholot": "Oholot",
    "negaim": "Negaim",
    "parah": "Parah",
    "tahorot": "Tahorot",
    "mikvaot": "Mikvaot",
    "niddah": "Niddah", "nidda": "Niddah",
    "makhshirin": "Makhshirin",
    "zavim": "Zavim",
    "tevul yom": "Tevul Yom",
    "yadayim": "Yadayim",
    "uktzin": "Uktzin"
};

/**
 * Normalizes a tractate name to its canonical spelling.
 * @param name The raw tractate name (e.g., "bava kama", "Bava Kama")
 * @returns The canonical name (e.g., "Bava Kamma") or the original if not found.
 */
export const normalizeTractate = (name: string): string => {
    if (!name) return 'Unknown';
    const lowerName = name.toLowerCase().trim();
    return TRACTATE_MAPPINGS[lowerName] || name; // Return mapped name or original (capitalized by caller usually, but here we return input if no match)
};

/**
 * Extracts and normalizes a tractate name from a full source string.
 * Uses the dictionary to find known tractates within the string.
 * @param sourceText The full source text (e.g., "Bavli Bava Kamma 2a")
 * @returns The canonical tractate name (e.g., "Bava Kamma") or "Unknown"
 */
export const extractTractate = (sourceText: string): string => {
    if (!sourceText) return 'Unknown';
    const lowerSource = sourceText.toLowerCase();

    // Get all known keys sorted by length descending to match longest first
    // (e.g. match "bava kamma" before "bava" if "bava" existed as a key)
    const knownTractates = Object.keys(TRACTATE_MAPPINGS).sort((a, b) => b.length - a.length);

    for (const tractate of knownTractates) {
        // Check if the source text contains the tractate name as a whole word
        // We use regex to ensure we don't match partial words (though less likely with tractate names)
        // Simple includes check is often enough but let's be safe with word boundaries if possible,
        // but for now simple includes is robust enough for "Bavli Bava Kamma 2a"
        if (lowerSource.includes(tractate)) {
            return TRACTATE_MAPPINGS[tractate];
        }
    }

    // Fallback: If no known tractate found, try to extract the first significant word
    // Skip "Bavli", "Yerushalmi", "Mishnah", "Tosefta"
    const parts = sourceText.split(' ');
    if (['Bavli', 'Yerushalmi', 'Mishnah', 'Tosefta'].includes(parts[0])) {
        return parts[1] || 'Unknown';
    }
    return parts[0] || 'Unknown';
};
