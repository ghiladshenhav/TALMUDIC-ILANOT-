/**
 * RAG Search Utility - Browser Compatible Version
 * 
 * Uses Pinecone REST API directly instead of the SDK (which requires Node.js)
 */

import { GoogleGenAI } from '@google/genai';

// Configuration
const PINECONE_INDEX_NAME = 'talmudic-corpus';
const EMBEDDING_MODEL = 'text-embedding-004';

// Lazy initialization of GenAI client
let genaiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
    if (!genaiClient) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('VITE_GEMINI_API_KEY is not set');
        }
        genaiClient = new GoogleGenAI({ apiKey });
    }
    return genaiClient;
}

export interface RagCandidate {
    ref: string;
    hebrewText: string;
    englishText: string;
    score: number;
    tractate: string;
}

/**
 * Generate embedding for input text
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const truncatedText = text.substring(0, 8000);
    const ai = getGenAI();
    const result = await ai.models.embedContent({ model: EMBEDDING_MODEL, contents: truncatedText });
    return result.embeddings?.[0]?.values || [];
}

/**
 * Get the Pinecone index host URL
 * Pinecone index URLs are in format: https://{index-name}-{project-id}.svc.{environment}.pinecone.io
 */
async function getPineconeIndexHost(): Promise<string> {
    const apiKey = import.meta.env.VITE_PINECONE_API_KEY;
    if (!apiKey) {
        throw new Error('VITE_PINECONE_API_KEY is not set');
    }

    // First, get the index host from Pinecone's control plane API
    const response = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`, {
        method: 'GET',
        headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to get Pinecone index info: ${response.status} ${response.statusText}`);
    }

    const indexInfo = await response.json();
    return indexInfo.host;
}

// Cache the index host to avoid repeated API calls
let cachedIndexHost: string | null = null;

/**
 * Search for similar Talmudic passages using vector similarity via REST API
 * 
 * @param text - The input text to find similar passages for
 * @param topK - Number of candidates to return (default: 10)
 * @returns Array of candidate passages with similarity scores
 */
export async function searchSimilarPassages(
    text: string,
    topK: number = 10
): Promise<RagCandidate[]> {
    try {
        console.log(`[RAG] Searching for ${topK} similar passages (dual-namespace)...`);

        const apiKey = import.meta.env.VITE_PINECONE_API_KEY;
        if (!apiKey) {
            throw new Error('VITE_PINECONE_API_KEY is not set');
        }

        // Generate embedding for the input text
        const embedding = await generateEmbedding(text);
        console.log(`[RAG] Generated embedding with ${embedding.length} dimensions`);

        // Get the index host (cached)
        if (!cachedIndexHost) {
            cachedIndexHost = await getPineconeIndexHost();
            console.log(`[RAG] Using Pinecone host: ${cachedIndexHost}`);
        }

        // Query BOTH namespaces in parallel:
        // - 'sentences' namespace: Has Ketubot at sentence-level (~12k vectors) - better for short phrases
        // - Default namespace: Has all tractates at page-level (~5k vectors) - broader coverage
        const [sentencesResponse, defaultResponse] = await Promise.all([
            fetch(`https://${cachedIndexHost}/query`, {
                method: 'POST',
                headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    namespace: 'sentences',
                    vector: embedding,
                    topK: Math.ceil(topK / 2), // Get half from each
                    includeMetadata: true
                })
            }),
            fetch(`https://${cachedIndexHost}/query`, {
                method: 'POST',
                headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Default namespace (no namespace specified = default)
                    vector: embedding,
                    topK: Math.ceil(topK / 2),
                    includeMetadata: true
                })
            })
        ]);

        if (!sentencesResponse.ok || !defaultResponse.ok) {
            throw new Error(`Pinecone query failed: sentences=${sentencesResponse.status}, default=${defaultResponse.status}`);
        }

        const [sentencesResult, defaultResult] = await Promise.all([
            sentencesResponse.json(),
            defaultResponse.json()
        ]);

        // Transform results from both namespaces
        const transformMatches = (matches: any[], source: string): RagCandidate[] =>
            (matches || []).map((match: any) => ({
                ref: (match.metadata?.ref as string) || 'Unknown',
                hebrewText: (match.metadata?.he as string) || '',
                englishText: (match.metadata?.en as string) || '',
                score: match.score || 0,
                tractate: (match.metadata?.tractate as string) || '',
                _source: source // Track which namespace for debugging
            }));

        const sentencesCandidates = transformMatches(sentencesResult.matches, 'sentences');
        const defaultCandidates = transformMatches(defaultResult.matches, 'default');

        console.log(`[RAG] Sentences namespace: ${sentencesCandidates.length} results, Default: ${defaultCandidates.length} results`);

        // Merge and deduplicate by reference
        const mergedMap = new Map<string, RagCandidate>();

        // Add all candidates, keeping the higher-scoring one if duplicates
        for (const candidate of [...sentencesCandidates, ...defaultCandidates]) {
            const key = candidate.ref.toLowerCase().replace(/:\d+$/, ''); // Normalize refs (remove segment numbers)
            const existing = mergedMap.get(key);
            if (!existing || candidate.score > existing.score) {
                mergedMap.set(key, candidate);
            }
        }

        // Sort by score descending
        const allCandidates = Array.from(mergedMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        // CRITICAL: Filter out low-confidence candidates
        // Scores below 0.65 are essentially random matches and will cause hallucinations
        const MIN_CONFIDENCE_SCORE = 0.65;
        const filteredCandidates = allCandidates.filter(c => c.score >= MIN_CONFIDENCE_SCORE);

        if (filteredCandidates.length < allCandidates.length) {
            console.log(`[RAG] Filtered ${allCandidates.length - filteredCandidates.length} low-confidence candidates (score < ${MIN_CONFIDENCE_SCORE})`);
        }

        console.log(`[RAG] Final: ${filteredCandidates.length} candidates above threshold. Top: ${filteredCandidates[0]?.ref} (score: ${filteredCandidates[0]?.score?.toFixed(3) || 'N/A'})`);

        return filteredCandidates;
    } catch (error) {
        console.error('[RAG] Search failed:', error);
        // Return empty array on failure - graceful degradation
        return [];
    }
}

/**
 * Format candidates for injection into AI prompt
 */
export function formatCandidatesForPrompt(candidates: RagCandidate[]): string {
    if (candidates.length === 0) {
        return '';
    }

    const formattedCandidates = candidates
        .slice(0, 10) // Limit to 10 to avoid token bloat
        .map((c, i) => {
            const hebrewPreview = c.hebrewText.substring(0, 300).replace(/\n/g, ' ');
            return `${i + 1}. **${c.ref}** (score: ${c.score.toFixed(2)})\n   Hebrew: "${hebrewPreview}..."`;
        })
        .join('\n');

    return `
*** VERIFIED TALMUDIC CORPUS - MANDATORY SOURCE FOR CITATIONS ***

YOU MUST USE THESE CANDIDATES FOR YOUR CITATIONS.
These passages are from a verified, indexed Talmudic corpus. They are semantically similar to the input text.

🚨 ABSOLUTE RULES FOR CITATIONS:
1. When citing a source, FIRST check if it appears in this candidate list.
2. If a candidate matches your identified reference, you MUST use the "ref" exactly as shown here.
3. You MUST copy the hebrewText VERBATIM from the matching candidate - DO NOT generate your own hebrewText.
4. If the exact phrase from the input text appears in a candidate's Hebrew text, that candidate is your verified source.
5. If you cite a source NOT in this list, you MUST set "sourceUnconfirmed": true - NO EXCEPTIONS.

🚫 CRITICAL - AVOID HALLUCINATION:
- If you cannot find the phrase in any candidate, set "sourceUnconfirmed": true.
- It is BETTER to admit uncertainty than to guess a wrong source.
- NEVER invent or guess a Talmud page number.
- If hebrewText is not available from candidates, LEAVE IT EMPTY rather than generating it.

📋 CANDIDATE PASSAGES (HIGH CONFIDENCE):
${formattedCandidates}

When a candidate matches, use this exact format in your response:
- source: [copy the "ref" from the candidate, e.g., "Bavli Berakhot 55b"]
- hebrewText: [copy the FULL Hebrew text from the matching candidate - DO NOT MODIFY]
- matchingPhrase: [the specific phrase that appears in BOTH the input text AND the hebrewText]
- fromRagCandidate: true
`;
}

// ========================================
// Sefaria Keyword Search (ElasticSearch)
// ========================================

/**
 * Search Sefaria using direct ElasticSearch API for exact phrase matching.
 * This is more precise than RAG for short Aramaic/Hebrew phrases.
 */
export async function sefariaKeywordSearch(
    phrase: string,
    topK: number = 5
): Promise<RagCandidate[]> {
    try {
        // Only search for Hebrew/Aramaic text
        if (!/[\u0590-\u05FF]/.test(phrase)) {
            console.log('[Sefaria Keyword] Skipping non-Hebrew phrase');
            return [];
        }

        console.log(`[Sefaria Keyword] Searching for: "${phrase}"`);

        // Use Sefaria's ElasticSearch proxy with match_phrase query
        const searchBody = {
            size: topK,
            _source: ["ref", "he", "path"],
            highlight: {
                pre_tags: [""],
                post_tags: [""],
                fields: {
                    exact: { fragment_size: 300 }
                }
            },
            query: {
                bool: {
                    must: {
                        match_phrase: {
                            exact: {
                                query: phrase,
                                slop: 2 // Allow 2 words between terms
                            }
                        }
                    },
                    filter: {
                        bool: {
                            should: [
                                { regexp: { path: "Talmud.*" } },
                                { regexp: { path: "Midrash.*" } }
                            ]
                        }
                    }
                }
            }
        };

        const response = await fetch('/api/sefaria/search/text/_search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(searchBody)
        });

        if (!response.ok) {
            console.warn(`[Sefaria Keyword] API returned ${response.status}`);
            return [];
        }

        const data = await response.json();

        if (!data.hits?.hits?.length) {
            console.log('[Sefaria Keyword] No exact matches found');
            return [];
        }

        const results: RagCandidate[] = data.hits.hits.map((hit: any) => ({
            ref: hit._source?.ref || 'Unknown',
            hebrewText: hit._source?.he || hit.highlight?.exact?.[0] || '',
            englishText: '',
            score: hit._score || 0,
            tractate: (hit._source?.path || '').split('/')[1] || '',
            isKeywordMatch: true // Flag to indicate this came from keyword search
        }));

        console.log(`[Sefaria Keyword] Found ${results.length} matches. Top: ${results[0]?.ref} (score: ${results[0]?.score})`);

        return results;
    } catch (error) {
        console.error('[Sefaria Keyword] Search failed:', error);
        return [];
    }
}

// ========================================
// Hybrid Search (RAG + Keyword)
// ========================================

/**
 * Perform hybrid search combining RAG semantic search with Sefaria keyword search.
 * Prioritizes keyword matches for short phrases where RAG embeddings fail.
 * 
 * @param text - The full input text for context
 * @param phrases - Extracted Hebrew phrases to search for (optional)
 */
export async function searchHybrid(
    text: string,
    phrases: string[] = [],
    topK: number = 10
): Promise<RagCandidate[]> {
    console.log('[Hybrid Search] Starting...');

    // Run RAG and keyword searches in parallel
    const [ragResults, ...keywordResults] = await Promise.all([
        searchSimilarPassages(text, topK),
        ...phrases.slice(0, 5).map(phrase => sefariaKeywordSearch(phrase, 3)) // Limit to 5 phrases
    ]);

    // Flatten keyword results
    const allKeywordResults = keywordResults.flat();

    console.log(`[Hybrid Search] RAG: ${ragResults.length} results, Keyword: ${allKeywordResults.length} results`);

    // Merge results, prioritizing keyword matches
    const mergedMap = new Map<string, RagCandidate>();

    // Add keyword results first (higher priority)
    for (const result of allKeywordResults) {
        const key = result.ref.toLowerCase();
        if (!mergedMap.has(key)) {
            // Boost keyword match scores significantly
            mergedMap.set(key, { ...result, score: result.score + 100 });
        }
    }

    // Add RAG results (lower priority, only if not already present)
    for (const result of ragResults) {
        const key = result.ref.toLowerCase();
        if (!mergedMap.has(key)) {
            mergedMap.set(key, result);
        }
    }

    // Sort by score descending
    const merged = Array.from(mergedMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    console.log(`[Hybrid Search] Merged: ${merged.length} results. Top: ${merged[0]?.ref} (score: ${merged[0]?.score})`);

    return merged;
}

// ========================================
// Branch Search (Modern Interpretations)
// ========================================

export interface BranchCandidate {
    branchId: string;
    treeId: string;
    author: string;
    workTitle: string;
    year: string;
    referenceText: string;
    rootSourceText: string;
    category: string;
    textPreview: string;
    score: number;
}

/**
 * Search for similar branches (modern interpretations) using vector similarity
 * 
 * @param text - The input text to find similar branches for
 * @param topK - Number of candidates to return (default: 10)
 * @returns Array of similar branch candidates with similarity scores
 */
export async function searchSimilarBranches(
    text: string,
    topK: number = 10
): Promise<BranchCandidate[]> {
    try {
        console.log(`[RAG-Branches] Searching for ${topK} similar branches...`);

        const apiKey = import.meta.env.VITE_PINECONE_API_KEY;
        if (!apiKey) {
            throw new Error('VITE_PINECONE_API_KEY is not set');
        }

        // Generate embedding for the input text
        const embedding = await generateEmbedding(text);
        console.log(`[RAG-Branches] Generated embedding with ${embedding.length} dimensions`);

        // Get the index host (cached)
        if (!cachedIndexHost) {
            cachedIndexHost = await getPineconeIndexHost();
        }

        // Query Pinecone via REST API with branches namespace
        const queryResponse = await fetch(`https://${cachedIndexHost}/query`, {
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                namespace: 'branches',
                vector: embedding,
                topK,
                includeMetadata: true
            })
        });

        if (!queryResponse.ok) {
            throw new Error(`Pinecone query failed: ${queryResponse.status} ${queryResponse.statusText}`);
        }

        const queryResult = await queryResponse.json();

        // Transform results
        const candidates: BranchCandidate[] = (queryResult.matches || []).map((match: any) => ({
            branchId: (match.metadata?.branchId as string) || 'Unknown',
            treeId: (match.metadata?.treeId as string) || '',
            author: (match.metadata?.author as string) || 'Unknown',
            workTitle: (match.metadata?.workTitle as string) || '',
            year: (match.metadata?.year as string) || '',
            referenceText: (match.metadata?.referenceText as string) || '',
            rootSourceText: (match.metadata?.rootSourceText as string) || '',
            category: (match.metadata?.category as string) || '',
            textPreview: (match.metadata?.textPreview as string) || '',
            score: match.score || 0
        }));

        console.log(`[RAG-Branches] Found ${candidates.length} similar branches. Top score: ${candidates[0]?.score?.toFixed(3) || 'N/A'}`);

        return candidates;
    } catch (error) {
        console.error('[RAG-Branches] Search failed:', error);
        return [];
    }
}

/**
 * Check if RAG is available (Pinecone API key is configured)
 */
export function isRagAvailable(): boolean {
    return !!import.meta.env.VITE_PINECONE_API_KEY;
}

// ========================================
// Ground Truth RAG (Semantic Memory)
// ========================================

export interface GroundTruthCandidate {
    id: string;
    phrase: string;
    snippet: string;
    action: string;
    correctSource: string;
    originalSource?: string;
    correctionReason?: string;
    errorType?: string;
    confidenceLevel?: string;
    score: number;
}

/**
 * Search for semantically similar Ground Truth examples based on current text chunk.
 * This enables "long-term memory" - corrections from months ago resurface when relevant.
 * 
 * @param currentTextChunk - The specific text segment being analyzed
 * @param userId - User ID for filtering (users only see their own corrections)
 * @param topK - Number of examples to return (default: 10)
 */
export async function searchGroundTruthByRelevance(
    currentTextChunk: string,
    userId: string,
    topK: number = 10
): Promise<GroundTruthCandidate[]> {
    try {
        const apiKey = import.meta.env.VITE_PINECONE_API_KEY;
        if (!apiKey) {
            console.log('[GT-RAG] Pinecone not configured, skipping semantic search');
            return [];
        }

        console.log(`[GT-RAG] Searching for ${topK} relevant Ground Truth examples...`);

        // Generate embedding for the current text chunk
        const embedding = await generateEmbedding(currentTextChunk);

        // Get the index host (cached)
        if (!cachedIndexHost) {
            cachedIndexHost = await getPineconeIndexHost();
        }

        // Query Pinecone ground-truth namespace
        const queryResponse = await fetch(`https://${cachedIndexHost}/query`, {
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                namespace: 'ground-truth',
                vector: embedding,
                topK,
                includeMetadata: true,
                filter: { userId: { $eq: userId } }
            })
        });

        if (!queryResponse.ok) {
            console.warn(`[GT-RAG] Pinecone query failed: ${queryResponse.status}`);
            return [];
        }

        const queryResult = await queryResponse.json();

        // Transform and truncate results to prevent token bloat
        const candidates: GroundTruthCandidate[] = (queryResult.matches || []).map((match: any) => ({
            id: match.id || '',
            phrase: ((match.metadata?.phrase as string) || '').substring(0, 100),
            snippet: ((match.metadata?.snippet as string) || '').substring(0, 200),
            action: (match.metadata?.action as string) || '',
            correctSource: (match.metadata?.correctSource as string) || '',
            originalSource: (match.metadata?.originalSource as string) || undefined,
            correctionReason: ((match.metadata?.correctionReason as string) || '').substring(0, 150),
            errorType: (match.metadata?.errorType as string) || undefined,
            confidenceLevel: (match.metadata?.confidenceLevel as string) || undefined,
            score: match.score || 0
        }));

        console.log(`[GT-RAG] Found ${candidates.length} relevant examples. Top score: ${candidates[0]?.score?.toFixed(3) || 'N/A'}`);

        return candidates;
    } catch (error) {
        console.error('[GT-RAG] Search failed:', error);
        return [];
    }
}

/**
 * Upsert a Ground Truth example to Pinecone for semantic retrieval.
 * Called when user saves a correction via saveGroundTruthExample.
 * 
 * @param docId - Firestore document ID (used as vector ID for deduplication)
 * @param phrase - The matched text
 * @param snippet - Context around the phrase
 * @param metadata - Full metadata to store with the vector
 */
export async function upsertGroundTruthToPinecone(
    docId: string,
    phrase: string,
    snippet: string,
    metadata: Record<string, any>
): Promise<void> {
    try {
        const apiKey = import.meta.env.VITE_PINECONE_API_KEY;
        if (!apiKey) {
            console.log('[GT-RAG] Pinecone not configured, skipping index');
            return;
        }

        // Generate embedding for semantic search
        const textToEmbed = `${phrase} ${snippet}`;
        const embedding = await generateEmbedding(textToEmbed);

        // Get the index host (cached)
        if (!cachedIndexHost) {
            cachedIndexHost = await getPineconeIndexHost();
        }

        // Upsert to Pinecone
        const upsertResponse = await fetch(`https://${cachedIndexHost}/vectors/upsert`, {
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                namespace: 'ground-truth',
                vectors: [{
                    id: docId,
                    values: embedding,
                    metadata: {
                        ...metadata,
                        // Truncate long fields to stay within Pinecone metadata limits
                        phrase: (metadata.phrase || phrase).substring(0, 500),
                        snippet: (metadata.snippet || snippet).substring(0, 1000),
                        correctionReason: (metadata.correctionReason || '').substring(0, 500)
                    }
                }]
            })
        });

        if (!upsertResponse.ok) {
            console.error(`[GT-RAG] Upsert failed: ${upsertResponse.status}`);
            return;
        }

        console.log(`[GT-RAG] Indexed Ground Truth example: ${docId}`);
    } catch (error) {
        console.error('[GT-RAG] Upsert failed:', error);
    }
}

/**
 * Format Ground Truth examples for injection into the AI prompt.
 * 
 * IMPORTANT: APPROVE examples are included to help find implicit patterns,
 * but wrapped with ANTI-PROJECTION guardrails to prevent the AI from
 * hallucinating sources that appear in training but not in the input text.
 */
export function formatGroundTruthForChunk(examples: GroundTruthCandidate[]): string {
    if (examples.length === 0) return '';

    const approved = examples.filter(e => e.action === 'APPROVE');
    const rejected = examples.filter(e => e.action === 'REJECT');
    const corrected = examples.filter(e => e.action === 'CORRECT');

    let output = '\n\n--- USER CORRECTIONS (LEARNING FROM PAST FEEDBACK) ---\n\n';

    // CRITICAL anti-projection instruction
    output += '⚠️ CRITICAL: These examples teach patterns from SIMILAR texts. ';
    output += 'DO NOT cite any source just because it appears below. ';
    output += 'ONLY cite sources if the ACTUAL INPUT TEXT contains the phrase or concept.\n\n';

    if (approved.length > 0) {
        output += '## ✅ IMPLICIT PATTERNS TO RECOGNIZE (if present in input):\n';
        output += 'These show what subtle references look like. Only cite if you find the pattern in the input:\n';
        approved.forEach(e => {
            output += `• Pattern: "${e.phrase}" → Source: ${e.correctSource}\n`;
        });
        output += '\n';
    }

    if (rejected.length > 0) {
        output += '## ⚠️ FALSE POSITIVES - DO NOT CITE:\n';
        rejected.forEach(e => {
            output += `• "${e.phrase}" - ${e.correctionReason || 'Not a valid reference'}`;
            if (e.errorType) output += ` [${e.errorType}]`;
            output += '\n';
        });
        output += '\n';
    }

    if (corrected.length > 0) {
        output += '## 🔧 CORRECTIONS - USE CORRECT SOURCE:\n';
        corrected.forEach(e => {
            output += `• "${e.phrase}" → ${e.correctSource}`;
            if (e.originalSource) output += ` (NOT ${e.originalSource})`;
            output += '\n';
        });
        output += '\n';
    }

    return output;
}

