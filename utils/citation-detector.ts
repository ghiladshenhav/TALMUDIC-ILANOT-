/**
 * Citation Detector - Detect Talmudic references WITHOUT LLM calls
 * 
 * Uses fuzzy string matching (fuzzball/RapidFuzz) to find implicit references
 * to Tanakh, Mishnah, and other canonical texts.
 * 
 * Expected impact: Detect 60-70% of explicit citations without any API cost.
 */

import * as fuzz from 'fuzzball';

// ============================================
// HEBREW NORMALIZATION
// ============================================

// Common Hebrew prefixes that should be stripped for matching
const HEBREW_PREFIXES = ['ו', 'ב', 'ה', 'ל', 'כ', 'מ', 'ש', 'וה', 'וב', 'ול', 'וכ', 'ומ', 'וש', 'כש', 'לכש', 'מש', 'בש'];

/**
 * Strip common Hebrew prefixes from a word
 * e.g., "ובבית" -> "בית", "והתורה" -> "תורה"
 */
function stripHebrewPrefix(word: string): string {
    // Sort prefixes by length descending to match longest first
    const sortedPrefixes = [...HEBREW_PREFIXES].sort((a, b) => b.length - a.length);

    for (const prefix of sortedPrefixes) {
        if (word.startsWith(prefix) && word.length > prefix.length + 1) {
            return word.slice(prefix.length);
        }
    }
    return word;
}

/**
 * Normalize Hebrew text for matching
 */
export function normalizeHebrew(text: string): string {
    return text
        .trim()
        .replace(/[\u0591-\u05C7]/g, '') // Remove niqqud and cantillation
        .replace(/[״"]/g, '"')          // Normalize quotes
        .replace(/[׳']/g, "'")          // Normalize apostrophe
        .replace(/־/g, ' ')             // Replace maqaf with space
        .replace(/\s+/g, ' ')           // Collapse whitespace
        .split(' ')
        .map(stripHebrewPrefix)
        .join(' ');
}

// ============================================
// TRIGRAM INDEXING
// ============================================

export interface CanonicalSource {
    ref: string;           // e.g., "Genesis 1:1" or "Berakhot 2a"
    text: string;          // The Hebrew text
    normalizedText: string; // Normalized for matching
    trigrams: Set<string>;  // 3-word sequences for fast lookup
}

export interface CitationMatch {
    sourceRef: string;
    sourceText: string;
    matchedSnippet: string;
    similarity: number;
    startIndex: number;
    endIndex: number;
}

/**
 * Extract trigrams (3-word sequences) from text
 */
function extractTrigrams(text: string): Set<string> {
    const words = text.split(' ').filter(w => w.length > 0);
    const trigrams = new Set<string>();

    for (let i = 0; i <= words.length - 3; i++) {
        const trigram = words.slice(i, i + 3).join(' ');
        trigrams.add(trigram);
    }

    return trigrams;
}

// ============================================
// KNOWN TALMUDIC PATTERNS
// ============================================

// Common Talmudic phrases that strongly indicate a source reference
const TALMUDIC_MARKERS = [
    // Mishnah citation patterns
    'תנן', 'תנינא', 'מתני', 'במתניתין',
    // Gemara citation patterns  
    'גמרא', 'אמר רב', 'אמר רבי', 'תניא', 'דתניא', 'כדתניא',
    // Verse citation patterns
    'שנאמר', 'דכתיב', 'כדכתיב', 'ככתוב', 'אמר הכתוב',
    // Logical patterns
    'קל וחומר', 'גזירה שוה', 'מה מצינו',
    // Discussion markers
    'מאי טעמא', 'מנא הני מילי', 'מנין', 'תלמוד לומר'
];

// Tractate names for pattern detection
const TRACTATE_NAMES = [
    'ברכות', 'שבת', 'עירובין', 'פסחים', 'ראש השנה', 'יומא', 'סוכה', 'ביצה', 'תענית',
    'מגילה', 'מועד קטן', 'חגיגה', 'יבמות', 'כתובות', 'נדרים', 'נזיר', 'סוטה', 'גיטין',
    'קידושין', 'בבא קמא', 'בבא מציעא', 'בבא בתרא', 'סנהדרין', 'מכות', 'שבועות', 'עבודה זרה',
    'הוריות', 'זבחים', 'מנחות', 'חולין', 'בכורות', 'ערכין', 'תמורה', 'כריתות', 'מעילה',
    'תמיד', 'מדות', 'קנים', 'נדה', 'אבות', 'פרקי אבות'
];

// ============================================
// BUILT-IN REFERENCE INDEX (Core verses/statements)
// ============================================

const CORE_REFERENCES: CanonicalSource[] = [
    // Genesis opening verses
    { ref: 'בראשית א:א', text: 'בראשית ברא אלהים את השמים ואת הארץ', normalizedText: '', trigrams: new Set() },
    { ref: 'בראשית א:ב', text: 'והארץ היתה תהו ובהו וחשך על פני תהום', normalizedText: '', trigrams: new Set() },

    // Shema
    { ref: 'דברים ו:ד', text: 'שמע ישראל יהוה אלהינו יהוה אחד', normalizedText: '', trigrams: new Set() },
    { ref: 'דברים ו:ה', text: 'ואהבת את יהוה אלהיך בכל לבבך ובכל נפשך ובכל מאדך', normalizedText: '', trigrams: new Set() },

    // Common Talmudic statements
    { ref: 'אבות א:א', text: 'משה קבל תורה מסיני ומסרה ליהושע', normalizedText: '', trigrams: new Set() },
    { ref: 'אבות ב:ד', text: 'אל תאמין בעצמך עד יום מותך', normalizedText: '', trigrams: new Set() },
    { ref: 'אבות ב:טז', text: 'לא עליך המלאכה לגמור', normalizedText: '', trigrams: new Set() },

    // Hillel & Shammai
    { ref: 'שבת לא.', text: 'דעלך סני לחברך לא תעביד', normalizedText: '', trigrams: new Set() },

    // Famous legal principles
    { ref: 'בבא מציעא ב:', text: 'המוציא מחברו עליו הראיה', normalizedText: '', trigrams: new Set() },
    { ref: 'סנהדרין לז.', text: 'כל המקיים נפש אחת מישראל כאילו קיים עולם מלא', normalizedText: '', trigrams: new Set() },
];

// Initialize the reference index
function initializeReferenceIndex(): CanonicalSource[] {
    return CORE_REFERENCES.map(source => ({
        ...source,
        normalizedText: normalizeHebrew(source.text),
        trigrams: extractTrigrams(normalizeHebrew(source.text))
    }));
}

// Lazy initialization
let referenceIndex: CanonicalSource[] | null = null;

function getReferenceIndex(): CanonicalSource[] {
    if (!referenceIndex) {
        referenceIndex = initializeReferenceIndex();
    }
    return referenceIndex;
}

// ============================================
// MAIN DETECTION FUNCTIONS
// ============================================

/**
 * Detect citation markers in text (very fast, regex-based)
 */
export function detectCitationMarkers(text: string): string[] {
    const found: string[] = [];

    for (const marker of TALMUDIC_MARKERS) {
        if (text.includes(marker)) {
            found.push(marker);
        }
    }

    return found;
}

/**
 * Detect tractate name mentions
 */
export function detectTractateNames(text: string): string[] {
    const found: string[] = [];

    for (const tractate of TRACTATE_NAMES) {
        if (text.includes(tractate)) {
            found.push(tractate);
        }
    }

    return found;
}

/**
 * Find fuzzy matches against the reference index
 */
export function findCitations(text: string, minSimilarity: number = 80): CitationMatch[] {
    const matches: CitationMatch[] = [];
    const normalizedInput = normalizeHebrew(text);
    const inputWords = normalizedInput.split(' ');
    const index = getReferenceIndex();

    // Sliding window of 5-15 words to check against sources
    for (let windowSize = 5; windowSize <= Math.min(15, inputWords.length); windowSize++) {
        for (let i = 0; i <= inputWords.length - windowSize; i++) {
            const snippet = inputWords.slice(i, i + windowSize).join(' ');

            for (const source of index) {
                // Quick trigram check first (fast)
                const snippetTrigrams = extractTrigrams(snippet);
                const overlap = Array.from(snippetTrigrams).filter(t => source.trigrams.has(t)).length;

                if (overlap < 1) continue; // No trigram overlap, skip

                // Full fuzzy match (slower but accurate)
                const similarity = fuzz.partial_ratio(snippet, source.normalizedText);

                if (similarity >= minSimilarity) {
                    // Find original position in unnormalized text
                    const startIndex = text.indexOf(snippet.split(' ')[0]);
                    const endIndex = startIndex + snippet.length;

                    matches.push({
                        sourceRef: source.ref,
                        sourceText: source.text,
                        matchedSnippet: snippet,
                        similarity,
                        startIndex: startIndex >= 0 ? startIndex : 0,
                        endIndex: endIndex >= 0 ? endIndex : text.length
                    });
                }
            }
        }
    }

    // Deduplicate overlapping matches, keeping highest similarity
    return deduplicateMatches(matches);
}

/**
 * Deduplicate overlapping matches
 */
function deduplicateMatches(matches: CitationMatch[]): CitationMatch[] {
    if (matches.length === 0) return [];

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);

    const kept: CitationMatch[] = [];
    const usedRanges: Array<{ start: number, end: number }> = [];

    for (const match of matches) {
        // Check if this range overlaps with any kept match
        const overlaps = usedRanges.some(range =>
            (match.startIndex >= range.start && match.startIndex < range.end) ||
            (match.endIndex > range.start && match.endIndex <= range.end)
        );

        if (!overlaps) {
            kept.push(match);
            usedRanges.push({ start: match.startIndex, end: match.endIndex });
        }
    }

    return kept;
}

// ============================================
// HIGH-LEVEL API
// ============================================

export interface DetectionResult {
    citationMarkers: string[];
    tractateNames: string[];
    fuzzyMatches: CitationMatch[];
    hasLikelyCitations: boolean;
}

/**
 * Run all detection methods on a text chunk
 * Returns detection results WITHOUT making any LLM calls
 */
export function detectReferences(text: string): DetectionResult {
    const citationMarkers = detectCitationMarkers(text);
    const tractateNames = detectTractateNames(text);
    const fuzzyMatches = findCitations(text, 85);

    return {
        citationMarkers,
        tractateNames,
        fuzzyMatches,
        hasLikelyCitations: citationMarkers.length > 0 || tractateNames.length > 0 || fuzzyMatches.length > 0
    };
}

/**
 * Pre-filter text chunks to identify which need LLM analysis
 * Returns true if the chunk likely contains Talmudic references
 */
export function shouldAnalyzeChunk(text: string): boolean {
    const result = detectReferences(text);
    return result.hasLikelyCitations;
}

/**
 * Convert detection results to AIFinding-compatible format
 */
export function detectionResultToFindings(result: DetectionResult, text: string): any[] {
    const findings: any[] = [];

    // Convert fuzzy matches to findings
    for (const match of result.fuzzyMatches) {
        findings.push({
            source: match.sourceRef,
            snippet: match.matchedSnippet,
            hebrewText: match.sourceText,
            confidence: match.similarity,
            justification: `Detected via fuzzy matching (${match.similarity}% similarity). No LLM call required.`,
            type: 'explicit',
            status: 'pending',
            detectionMethod: 'fuzzy-match'
        });
    }

    // Add tractate name mentions as potential references
    for (const tractate of result.tractateNames) {
        const idx = text.indexOf(tractate);
        const context = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + tractate.length + 30));

        findings.push({
            source: tractate,
            snippet: context,
            hebrewText: '',
            confidence: 70,
            justification: `Tractate name "${tractate}" detected. May indicate reference - verify with LLM.`,
            type: 'possible',
            status: 'pending',
            detectionMethod: 'pattern-match'
        });
    }

    return findings;
}
