
export interface SefariaText {
    hebrewText: string;
    translation: string;
    ref: string;
}

// Import the local data fetcher
import { getLocalTalmudText } from './sefaria-local';

// Flag to control local-first behavior (can be disabled for testing)
let useLocalFirst = true;

export function setLocalFirst(enabled: boolean): void {
    useLocalFirst = enabled;
    console.log(`[Sefaria] Local-first mode: ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Fetch Talmudic text by reference.
 * Tries local data first (if available), then falls back to API.
 */
export const fetchTalmudText = async (ref: string): Promise<SefariaText | null> => {
    // Try local data first (no API call needed!)
    if (useLocalFirst) {
        const localResult = await getLocalTalmudText(ref);
        if (localResult) {
            console.log(`[Sefaria] Using local data for: "${ref}"`);
            return localResult;
        }
        console.log(`[Sefaria] Local data not found for "${ref}", falling back to API...`);
    }

    // Fallback to API
    return fetchTalmudTextFromAPI(ref);
};

/**
 * Fetch Talmudic text from Sefaria API (original implementation)
 */
const fetchTalmudTextFromAPI = async (ref: string): Promise<SefariaText | null> => {
    try {
        // Clean the ref to ensure Sefaria understands it
        // Remove "Talmud Bavli", "Masechet", "b.", commas, etc.
        const cleanRef = ref
            .replace(/^(Talmud\s+)?(Bavli|Yerushalmi|Masechet|Tractate|b\.|y\.)\s*/i, '')
            .replace(/,/g, '')
            .trim();

        console.log(`[Sefaria API] Fetching: "${cleanRef}" (original: "${ref}")`);

        // Use the Vite proxy to avoid CORS issues
        const url = `/api/sefaria/texts/${encodeURIComponent(cleanRef)}?context=0&pad=0&alts=0&bare=0`;

        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[Sefaria API] Status ${response.status} for ref: ${ref}`);
            return null;
        }

        const data = await response.json();

        if (data.error) {
            console.warn(`[Sefaria API] Error for ref ${ref}:`, data.error);
            return null;
        }

        // Helper to strip HTML tags and join array segments (handles nested arrays)
        const flattenText = (text: any): string[] => {
            if (!text) return [];
            if (typeof text === 'string') return [text];
            if (Array.isArray(text)) {
                return text.flatMap(item => flattenText(item));
            }
            return [];
        };

        const processText = (text: any): string => {
            const flattened = flattenText(text);
            return flattened
                .filter(segment => typeof segment === 'string')
                .map(segment => segment.replace(/<[^>]*>?/gm, '')) // Strip HTML
                .join(' ') // Join segments with space
                .trim();
        };

        const hebrewText = processText(data.he);
        const translation = processText(data.text);

        // If we got nothing, consider it a failure
        if (!hebrewText && !translation) {
            return null;
        }

        return {
            hebrewText,
            translation,
            ref: data.ref // The canonical ref from Sefaria
        };

    } catch (error) {
        console.error("[Sefaria API] Failed to fetch:", error);
        return null;
    }
};

// Removed static KNOWN_PHRASES table in favor of robust API search

/**
 * Search Sefaria for a phrase and return the source reference where it appears.
 * Used as a fallback when RAG/AI hallucination is detected.
 */
export interface SefariaSearchResult {
    ref: string;
    hebrewText: string;
    score: number;
}

export const searchSefariaForPhrase = async (phrase: string, filters: string[] = ["Talmud"]): Promise<SefariaSearchResult[]> => {
    console.log(`[Sefaria Smart Search] Starting search for: "${phrase}"`);

    // Use Sefaria's direct search API - requires POST with JSON body
    const performSearch = async (query: string, slop: number, field: string, description: string): Promise<SefariaSearchResult[]> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            // Sefaria search-wrapper requires POST with JSON body
            const searchBody = {
                query: query,
                type: "text",
                field: field,
                slop: slop,
                size: 5,
                filters: filters,
                filter_fields: filters.map(() => "path"),
                source_proj: true
            };

            const response = await fetch(`/api/sefaria/search-wrapper`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(searchBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Sefaria Search] ${description} failed: ${response.status}`);
                return [];
            }

            const data = await response.json();

            if (!data.hits?.hits?.length) return [];

            return data.hits.hits
                .map((hit: any) => {
                    // Strip HTML from the Hebrew text
                    let hebrewText = hit._source?.he || hit._source?.exact || hit._source?.naive_lemmatizer || "";
                    if (typeof hebrewText === 'string') {
                        hebrewText = hebrewText.replace(/<[^>]*>?/gm, '').trim();
                    }
                    return {
                        ref: hit._source?.ref || hit._id,
                        hebrewText,
                        score: hit._score || 0
                    };
                })
                .filter((r: SefariaSearchResult) => r.hebrewText.length > 0);

        } catch (error) {
            console.error(`[Sefaria Search] ${description} error:`, error);
            return [];
        }
    };

    // Strategy 1: Exact Match with naive_lemmatizer (handles prefixes/suffixes) - slop 0
    const exactResults = await performSearch(phrase, 0, 'naive_lemmatizer', 'Exact Lemmatized');
    if (exactResults.length > 0) {
        console.log(`[Sefaria Smart Search] Found ${exactResults.length} exact lemmatized matches.`);
        return exactResults;
    }

    // Strategy 2: Relaxed Match - slop 2 (allows insertions like honorifics)
    const relaxedResults = await performSearch(phrase, 2, 'naive_lemmatizer', 'Relaxed Match');
    if (relaxedResults.length > 0) {
        console.log(`[Sefaria Smart Search] Found ${relaxedResults.length} relaxed matches.`);
        return relaxedResults;
    }

    // Strategy 3: Looser Match - slop 5 (more flexible)
    const looseResults = await performSearch(phrase, 5, 'naive_lemmatizer', 'Loose Match');
    if (looseResults.length > 0) {
        console.log(`[Sefaria Smart Search] Found ${looseResults.length} loose matches.`);
        return looseResults;
    }

    // Strategy 4: Keyword Search (Fallback for very messy inputs)
    const keywords = phrase.split(/[\s\-,.]+/).filter(w => w.length > 3).slice(0, 4).join(" ");
    if (keywords.length > 3 && keywords !== phrase) {
        const keywordResults = await performSearch(keywords, 10, 'naive_lemmatizer', 'Keyword Match');
        if (keywordResults.length > 0) {
            console.log(`[Sefaria Smart Search] Found ${keywordResults.length} keyword matches for "${keywords}".`);
            return keywordResults;
        }
    }

    console.log(`[Sefaria Smart Search] No results found for: "${phrase}"`);
    return [];
};

/**
 * Use Sefaria's official Find Refs API to detect citations in text.
 * This is the purpose-built citation finder: https://developers.sefaria.org/docs/linker-api
 */
export interface SefariaFindRefsResult {
    text: string;       // The detected citation text
    refs: string[];     // List of possible Sefaria references
    hebrewText?: string;
    englishText?: string;
    startChar: number;
    endChar: number;
}

export const findRefsInText = async (text: string): Promise<SefariaFindRefsResult[]> => {
    console.log(`[Sefaria Find-Refs] Searching for citations in text (${text.length} chars)...`);

    try {
        // Step 1: Submit the text to find-refs endpoint (async API)
        const submitResponse = await fetch('/api/sefaria/find-refs?with_text=1&max_segments=3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: { body: text }
            })
        });

        if (!submitResponse.ok) {
            console.error('[Sefaria Find-Refs] Submit failed:', submitResponse.status);
            return [];
        }

        const { task_id } = await submitResponse.json();
        if (!task_id) {
            console.error('[Sefaria Find-Refs] No task_id received');
            return [];
        }

        console.log(`[Sefaria Find-Refs] Task submitted: ${task_id}`);

        // Step 2: Poll the async endpoint for results
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

            const pollResponse = await fetch(`/api/sefaria/async/${task_id}`);

            if (pollResponse.status === 200) {
                const data = await pollResponse.json();

                if (data.state === 'SUCCESS' && data.result?.body) {
                    const results: SefariaFindRefsResult[] = [];
                    const bodyResults = data.result.body.results || [];
                    const refData = data.result.body.refData || {};

                    for (const result of bodyResults) {
                        if (result.refs && result.refs.length > 0) {
                            const primaryRef = result.refs[0];
                            const refInfo = refData[primaryRef] || {};

                            // Helper to strip HTML tags
                            const stripHtml = (text: any): string => {
                                if (!text) return '';
                                const str = Array.isArray(text) ? text.join(' ') : String(text);
                                return str.replace(/<[^>]*>?/gm, '').trim();
                            };

                            results.push({
                                text: result.text,
                                refs: result.refs,
                                hebrewText: stripHtml(refInfo.he),
                                englishText: stripHtml(refInfo.en),
                                startChar: result.startChar,
                                endChar: result.endChar
                            });
                        }
                    }

                    console.log(`[Sefaria Find-Refs] Found ${results.length} citations`);
                    return results;
                } else if (data.state === 'FAILURE') {
                    console.error('[Sefaria Find-Refs] Task failed:', data);
                    return [];
                }
            }

            attempts++;
        }

        console.warn('[Sefaria Find-Refs] Task timed out');
        return [];

    } catch (error) {
        console.error('[Sefaria Find-Refs] Error:', error);
        return [];
    }
};
