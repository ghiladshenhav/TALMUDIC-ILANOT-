/**
 * Author portrait mapping utility
 * Maps author names to their portrait image paths
 */

// Mapping of normalized author names to portrait filenames
const AUTHOR_PORTRAITS: Record<string, string> = {
    // English names
    'Aharon Marcus': '/authors/aharon_marcus.png',
    'Heinrich Brody': '/authors/heinrich_brody.png',
    'Heinrich York Steiner': '/authors/heinrich_york_steiner.png',
    'Karpel Lippe': '/authors/karpel_lippe.png',
    'Leopold Dukes': '/authors/leopold_dukes.png',
    'L. Aronsohn': '/authors/l_aronsohn.png',
    'Dr. Aschkanaze': '/authors/dr_aschkanaze.png',

    // Hebrew names with transliterated keys
    'אחד העם': '/authors/achad_haam.png',
    'Ahad Haam': '/authors/achad_haam.png',
    'Achad Haam': '/authors/achad_haam.png',
    'חיים נחמן ביאליק': '/authors/chaim_nachman_bialik.png',
    'Chaim Nachman Bialik': '/authors/chaim_nachman_bialik.png',
    'H.N. Bialik': '/authors/chaim_nachman_bialik.png',
    'יוסף עזריהו': '/authors/yosef_azaryah.png',
    'Yosef Azaryah': '/authors/yosef_azaryah.png',
    'ישראל חיים טביוב': '/authors/yisrael_chaim_taviov.png',
    'Yisrael Chaim Taviov': '/authors/yisrael_chaim_taviov.png',
    'מיכה יוסף ברדיצ\'בסקי': '/authors/micha_yosef_berdichevsky.png',
    'Micha Yosef Berdichevsky': '/authors/micha_yosef_berdichevsky.png',
    'M.J. Berdichevsky': '/authors/micha_yosef_berdichevsky.png',
    'מיכל פינס': '/authors/michal_pines.png',
    'Michal Pines': '/authors/michal_pines.png',
    'משה לייב לילינבלום': '/authors/moshe_leib_lilienblum.png',
    'Moshe Leib Lilienblum': '/authors/moshe_leib_lilienblum.png',
    'נחום סוקולוב': '/authors/nachum_sokolov.png',
    'Nachum Sokolov': '/authors/nachum_sokolov.png',
    'שמעון רבידוביץ\'': '/authors/shimon_ravidovitch.png',
    'Shimon Ravidovitch': '/authors/shimon_ravidovitch.png',
};

/**
 * Get the portrait URL for an author
 * Returns the path to the portrait image, or undefined if not found
 */
export function getAuthorPortraitUrl(authorName: string): string | undefined {
    // Try exact match first
    if (AUTHOR_PORTRAITS[authorName]) {
        return AUTHOR_PORTRAITS[authorName];
    }

    // Try normalized match (remove quotes, normalize whitespace)
    const normalized = authorName.trim().replace(/['"]/g, '');
    if (AUTHOR_PORTRAITS[normalized]) {
        return AUTHOR_PORTRAITS[normalized];
    }

    // Try case-insensitive match
    const lowerName = normalized.toLowerCase();
    for (const [name, url] of Object.entries(AUTHOR_PORTRAITS)) {
        if (name.toLowerCase() === lowerName) {
            return url;
        }
    }

    return undefined;
}

/**
 * Check if an author has a portrait
 */
export function hasAuthorPortrait(authorName: string): boolean {
    return getAuthorPortraitUrl(authorName) !== undefined;
}

export { AUTHOR_PORTRAITS };
