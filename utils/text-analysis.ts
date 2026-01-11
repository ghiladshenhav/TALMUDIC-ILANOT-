import { GoogleGenAI } from "@google/genai";
import { generateContentWithRetry } from './ai-helpers';
import { AIFinding } from '../types';
import {
    isInteractionsAvailable,
    sendMessage as sendInteractionMessage,
    createSession
} from '../services/interactions-client';
import { searchGroundTruthByRelevance, formatGroundTruthForChunk, searchHybrid, RagCandidate } from './rag-search';
import { AnalysisProvider, isDictaAvailable, analyzeTextWithDicta } from './dicta-local';
import { checkCache, cacheResponse } from './query-cache';
import { detectReferences, detectionResultToFindings } from './citation-detector';
import { prefilterWithGroundTruth, isPrefilterAvailable } from './gt-prefilter';

enum SchemaType {
    STRING = "STRING",
    NUMBER = "NUMBER",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    ARRAY = "ARRAY",
    OBJECT = "OBJECT"
}

// Reuse the Type alias
const Type = SchemaType;

const BASE_PROMPT = `You are a Talmudic research assistant with one task: to locate all Talmudic or Midrashic references in a given text, and for each reference, retrieve the original source text.
 
 *** CRITICAL INSTRUCTION: HANDLE MIXED SCRIPTS & REVERSED HEBREW ***
 The input text is extracted from a PDF or web page. Hebrew characters might be in VISUAL ORDER (reversed).
 - Example of Visual Order: "olleh" instead of "hello".
 - YOU MUST DETECT THIS and REVERSE the Hebrew text back to LOGICAL ORDER in your output.
 - "snippet" and "hebrewText" fields MUST be in logical order (readable Hebrew).
 - When transcribing the "snippet", preserve the EXACT characters used in the source, but fix the directionality if it's reversed.

 *** CRITICAL INSTRUCTION: PAGE NUMBERS ***
 The text contains [[PAGE_X]] markers (e.g., [[PAGE_1]], [[PAGE_2]]).
 - For EVERY reference found, you MUST look backwards to find the nearest [[PAGE_X]] marker.
 - The "pageNumber" field is MANDATORY. Do not guess. Use the marker.

 *** CRITICAL INSTRUCTION: BE HIGHLY SENSITIVE TO IMPLICIT REFERENCES ***
 You must go beyond obvious citations. You are looking for the "DNA" of the Talmud in the text.
 Detect ANY of the following types of connections:

 1. **Explicit Citations**: Direct quotes or mentions (e.g., "As Rabbi Akiva said...").
 
 2. **Linguistic Echoes (Implicit)**: 
    - Use of specific Aramaic or Hebrew idioms (e.g., "Kal Vachomer", "Teiku", "Lav Davka").
    - Phrasing that mimics Gemara structure (e.g., "One might have thought X, therefore it teaches Y").
    - Borrowed terminology even if used in a secular context.
 
 3. **Conceptual Allusions (Implicit)**:
    - Discussions that mirror specific Talmudic debates (e.g., an argument about "intent vs. action" that parallels the "Mitzvot Tzrichot Kavana" sugya).
    - Usage of specific halakhic categories to describe non-halakhic situations.
    - Narrative motifs borrowed from Aggadah (e.g., a story structure resembling "The Oven of Akhnai").
 
 4. **Structural Parallels (Implicit)**:
    - Arguments built using the logic of a specific Sugya.
 
 **If you suspect a connection, flag it.** It is better to include a potential allusion than to miss it. Use the "justification" field to explain the subtle link you found.
 
 For each reference you find, you must provide a JSON object with the following fields: "source", "snippet", "contextBefore", "contextAfter", "justification", "title", "hebrewText", "translation", "isImplicit", and "pageNumber".
 
 CRITICAL CITATION FORMAT RULES FOR "source":
 - You MUST use this exact format: "[Corpus] [Tractate] [Page][Folio]"
 - Examples of CORRECT format: "Bavli Gittin 10b", "Bavli Kiddushin 40a", "Mishnah Peah 1:1", "Yerushalmi Berakhot 2a"
 - NEVER use generic references like "Talmud", "Mishnah", "the Gemara", or "rabbinic literature"
 - NEVER use double pages like "10a-b" or "10a-10b" - pick ONE specific page
 - NEVER use variations like "BT", "b.", "Tractate", "Masechet" - use "Bavli" or "Yerushalmi" only
 - NEVER include chapter numbers unless it's Mishnah format (e.g., "Mishnah Peah 1:1")
 - The tractate name must be spelled consistently (e.g., always "Gittin", never "Gitin" or "Gittin Tractate")
 - DO NOT include "Analysis of" or any descriptive text - citation only
 
 - "snippet": The quote from the input document where the reference is made.
 - "contextBefore": The two sentences immediately preceding the snippet.
 - "contextAfter": The two sentences immediately following the snippet.
 - "justification": Explain WHY this is a reference. If implicit, explain the connection.
 - "title": A short title for the reference (e.g., "The Oven of Akhnai").
 - "hebrewText": The original Hebrew/Aramaic text from the source (e.g., the Gemara text).
 - "translation": An English translation of the Hebrew text.
 - "isImplicit": Boolean (true/false).
 - "pageNumber": The page number where the reference was found (derived from [[PAGE_X]]).
 
 IMPORTANT: If the input text contains the English translation of a Talmudic source, DO NOT create a separate finding for it if you have already identified the source itself. Just include the translation in the "translation" field of the main finding. We do not want separate nodes for the translation.
 
 IMPORTANT: LIMIT YOUR OUTPUT. Return ONLY genuine references you can confidently identify. If there are none, return an empty array. Quality over quantity - do NOT invent references.
 
 Return a single JSON object with one key, "foundReferences", which is an array of these objects, ordered chronologically as they appear in the source text.

 --- DOCUMENT TEXT ---
 `;

// ========================================
// HYPOTHESIS SCANNER: 2-Pass Workflow
// ========================================

/**
 * Cost estimate for an analysis operation
 */
export interface CostEstimate {
    /** Number of text chunks that will be processed */
    chunks: number;
    /** Estimated API calls in standard (1-pass) mode */
    apiCallsStandard: number;
    /** Estimated API calls in Deep Scan (2-pass) mode */
    apiCallsDeepScan: number;
    /** Estimated input tokens in standard mode */
    estimatedTokensStandard: number;
    /** Estimated input tokens in Deep Scan mode */
    estimatedTokensDeepScan: number;
    /** Number of RAG/embedding searches */
    ragSearches: number;
    /** Text length in characters */
    textLength: number;
    /** Estimated processing time in seconds */
    estimatedTimeSeconds: number;
}

/**
 * Analysis options for controlling the analysis workflow
 */
export interface AnalysisOptions {
    /** Enable 2-pass Hypothesis Scanner for better implicit reference detection */
    enableHypothesisScanner?: boolean;
    /** User ID for Ground Truth retrieval */
    userId?: string;
    /** Progress callback */
    progressCallback?: (processedChars: number, totalChars: number) => void;
    /** Dry run mode - returns cost estimate without making API calls */
    dryRun?: boolean;
    /** Delay between chunks in ms (for rate limiting). Default: 2000ms */
    delayBetweenChunksMs?: number;
    /** Callback with cost estimate before analysis starts */
    onCostEstimate?: (estimate: CostEstimate) => void;
    /** Analysis provider: 'gemini' (paid, default) or 'dicta' (FREE local) */
    provider?: AnalysisProvider;
}

// Re-export for convenience
export type { AnalysisProvider } from './dicta-local';

/** Chunk size used for splitting text - increased to 4000 for fewer API calls */
const CHUNK_SIZE = 4000;

/**
 * Estimate the cost of analyzing a text without making any API calls.
 * Use this for previewing the scope of an analysis operation.
 */
export function estimateAnalysisCost(text: string): CostEstimate {
    const textLength = text.length;
    const chunks = Math.ceil(textLength / CHUNK_SIZE);

    // Standard mode: 1 Gemini call + 1 RAG embedding per chunk
    const apiCallsStandard = chunks * 2;

    // Deep Scan mode: 2 Gemini calls (Scanner + Librarian) + ~3 RAG searches per chunk
    // (1 for GT lookup, ~2 for suspect keyword searches)
    const apiCallsDeepScan = chunks * 5;

    // Token estimates (approximate)
    // Standard: ~4000 (chunk) + ~2000 (prompt) = ~6000 per chunk
    // Deep Scan: ~4000 (chunk) + ~2000 (scanner prompt) + ~3000 (librarian prompt with RAG) = ~9000 per chunk for each of 2 passes
    const estimatedTokensStandard = chunks * 6000;
    const estimatedTokensDeepScan = chunks * 12000;

    // RAG searches
    const ragSearches = chunks; // 1 per chunk in standard, more in deep scan

    // Time estimate: ~3s per standard chunk, ~7s per deep scan chunk (with rate limiting)
    const estimatedTimeSeconds = chunks * 5; // Average

    return {
        chunks,
        apiCallsStandard,
        apiCallsDeepScan,
        estimatedTokensStandard,
        estimatedTokensDeepScan,
        ragSearches,
        textLength,
        estimatedTimeSeconds
    };
}


/**
 * Suspect found by the Scanner (Pass 1)
 */
interface Suspect {
    snippet: string;
    suspectedConcept: string;
    searchKeywords: string[];
}

/**
 * Pass 1: The "Pattern Scout" - finds potential Talmudic concepts with high recall.
 * Does NOT cite sources yet, just flags suspicious patterns.
 */
const SCANNER_PROMPT = `You are a "Talmudic Pattern Scout". Your ONLY job is to flag text segments that MIGHT borrow from Talmudic logic, idioms, or narratives.

LOOK FOR:
- "Kal Vachomer" (A fortiori) reasoning: "If X is true for the minor case, certainly Y is true for the major case"
- "Migo" arguments: "Since he could have made a stronger claim, his weaker claim is credible"
- Structural idioms: "One might think X, therefore it teaches Y", "What is the reason?"
- Famous motifs: "Oven of Akhnai", "On one foot", "Hillel and Shammai debates"
- Legal concepts applied to secular topics: "possession", "intent vs action", "doubt"
- Aramaic loanwords or Hebrew legal terminology

For each potential Talmudic echo, provide:
1. "snippet" - The EXACT text segment (copy verbatim)
2. "suspectedConcept" - What Talmudic pattern you see (e.g., "Kal Vachomer", "Oven of Akhnai motif")
3. "searchKeywords" - 2-4 keywords to search for the source (mix Hebrew/English terms if applicable)

YOU MUST output valid JSON only:
{
  "suspects": [
    {
      "snippet": "if the lesser obligation applies, surely the greater one does",
      "suspectedConcept": "Kal Vachomer / A Fortiori Logic",
      "searchKeywords": ["Kal Vachomer", "קל וחומר", "minor major"]
    }
  ]
}

If NOTHING looks Talmudic, return: {"suspects": []}

Be GENEROUS in flagging - we will filter later. Better to catch a false positive than miss a real allusion.
`;

/**
 * Pass 2: The "Strict Librarian" - verifies suspects against RAG results.
 * Framed as a FILTER that defaults to rejection. Can return empty.
 */
const LIBRARIAN_PROMPT = `You are a STRICT Talmudic editor and fact-checker. Your job is to FILTER, not confirm.

Below are suspected Talmudic allusions found in a text. For each suspect, I've included potential source matches from our reference database.

YOUR TASK: DISCARD weak connections. KEEP only undeniable matches.

DISCARD if:
- The connection is purely coincidental or thematically vague
- The linguistic parallel is common phrasing (e.g., "on the other hand")
- No specific Talmudic source actually matches the pattern
- The RAG candidates don't support the suspected concept

KEEP ONLY if:
- There is an UNDENIABLE linguistic OR logical parallel
- You can cite a SPECIFIC source (e.g., "Bavli Sanhedrin 37a", NOT "Talmud" or "rabbinic literature")
- The suspected concept genuinely maps to a real Talmudic passage

If NONE of the suspects pass your filter, return an EMPTY array. This is expected and acceptable.

CITATION FORMAT (required):
- "source": "[Corpus] [Tractate] [Page][Folio]" (e.g., "Bavli Gittin 10b", "Mishnah Peah 1:1")
- NEVER use "the Talmud", "BT", "b.", or generic references

Output JSON only:
{
  "verifiedCitations": [
    {
      "source": "Bavli Sanhedrin 37a",
      "snippet": "exact text from the document",
      "contextBefore": "two sentences before",
      "contextAfter": "two sentences after", 
      "justification": "Why this is a real match",
      "title": "Short descriptive title",
      "hebrewText": "Original Hebrew/Aramaic if available",
      "translation": "English translation",
      "isImplicit": true,
      "pageNumber": 1
    }
  ]
}
`;

/**
 * Calculate character offsets for a snippet within source text.
 * Returns the best match position with confidence score.
 * Handles Hebrew RTL text and minor OCR/formatting variations.
 */
function calculateSnippetOffsets(
    snippet: string,
    fullText: string,
    chunkOffset: number = 0
): { startChar: number; endChar: number; confidence: number } | null {
    if (!snippet || !fullText) return null;

    // Normalize for matching (handle whitespace variations)
    const normalizedSnippet = snippet.trim().replace(/\s+/g, ' ');
    const normalizedText = fullText.replace(/\s+/g, ' ');

    // Exact match first (confidence = 1.0)
    const exactIndex = normalizedText.indexOf(normalizedSnippet);
    if (exactIndex !== -1) {
        return {
            startChar: chunkOffset + exactIndex,
            endChar: chunkOffset + exactIndex + normalizedSnippet.length,
            confidence: 1.0
        };
    }

    // Fallback: anchor-based matching using first 50 chars (confidence = 0.7)
    const anchorLength = Math.min(50, normalizedSnippet.length);
    const anchor = normalizedSnippet.substring(0, anchorLength);
    const anchorIndex = normalizedText.indexOf(anchor);
    if (anchorIndex !== -1) {
        return {
            startChar: chunkOffset + anchorIndex,
            endChar: chunkOffset + anchorIndex + normalizedSnippet.length,
            confidence: 0.7
        };
    }

    // Last resort: try end of snippet as anchor (confidence = 0.5)
    const endAnchor = normalizedSnippet.substring(Math.max(0, normalizedSnippet.length - anchorLength));
    const endAnchorIndex = normalizedText.indexOf(endAnchor);
    if (endAnchorIndex !== -1) {
        const estimatedStart = endAnchorIndex - (normalizedSnippet.length - endAnchor.length);
        return {
            startChar: chunkOffset + Math.max(0, estimatedStart),
            endChar: chunkOffset + endAnchorIndex + endAnchor.length,
            confidence: 0.5
        };
    }

    return null; // Cannot ground this snippet
}
/**
 * Format suspects with their RAG candidates for the Librarian prompt.
 * Groups each suspect with its specific candidates as requested.
 */
function formatSuspectsWithRagForLibrarian(
    suspects: Suspect[],
    ragResultsMap: Map<number, RagCandidate[]>,
    originalText: string
): string {
    if (suspects.length === 0) return '';

    let output = '\n--- SUSPECTS TO VERIFY ---\n\n';

    for (let i = 0; i < suspects.length; i++) {
        const suspect = suspects[i];
        const candidates = ragResultsMap.get(i) || [];

        output += `=== SUSPECT ${i + 1} ===\n`;
        output += `Snippet: "${suspect.snippet}"\n`;
        output += `Suspected Concept: ${suspect.suspectedConcept}\n`;
        output += `Search Keywords: ${suspect.searchKeywords.join(', ')}\n\n`;

        if (candidates.length > 0) {
            output += `POTENTIAL MATCHES (from database):\n`;
            for (let j = 0; j < Math.min(candidates.length, 3); j++) {
                const c = candidates[j];
                output += `  ${j + 1}A. ${c.ref} (score: ${c.score.toFixed(2)})\n`;
                output += `      Hebrew: ${c.hebrewText?.substring(0, 150) || 'N/A'}...\n`;
                output += `      English: ${c.englishText?.substring(0, 150) || 'N/A'}...\n`;
            }
        } else {
            output += `POTENTIAL MATCHES: None found in database\n`;
        }
        output += '\n';
    }

    output += `--- ORIGINAL TEXT CONTEXT ---\n${originalText.substring(0, 1500)}...\n`;

    return output;
}

/**
 * Process a chunk using the 2-pass Hypothesis Scanner workflow.
 * Pass 1: Scan for conceptual suspects (high recall)
 * Pass 2: Verify against RAG and filter (high precision)
 */
async function processChunkWithHypothesisScanner(
    textSegment: string,
    userId?: string
): Promise<any[]> {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const model = 'gemini-2.5-flash';

    console.log('[Hypothesis Scanner] Pass 1 starting...');

    // ========================================
    // PASS 1: SCANNER - Find suspects
    // ========================================
    let suspects: Suspect[] = [];
    try {
        // Include GT-RAG in scanner pass too (helps recognize patterns)
        let gtBlock = '';
        if (userId) {
            const gtExamples = await searchGroundTruthByRelevance(textSegment, userId, 3); // Reduced from 5 for cost
            if (gtExamples.length > 0) {
                gtBlock = formatGroundTruthForChunk(gtExamples);
            }
        }

        const scannerContent = `${SCANNER_PROMPT}\n${gtBlock}\n--- TEXT TO SCAN ---\n${textSegment}`;

        const scannerResponse = await generateContentWithRetry(ai.models, {
            model: model,
            contents: scannerContent,
            config: {
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suspects: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    snippet: { type: Type.STRING },
                                    suspectedConcept: { type: Type.STRING },
                                    searchKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                                },
                                required: ["snippet", "suspectedConcept", "searchKeywords"]
                            }
                        }
                    }
                }
            }
        });

        // Parse scanner response
        let scannerJson = '';
        if (typeof scannerResponse.text === 'string') {
            scannerJson = scannerResponse.text;
        } else if (typeof scannerResponse.text === 'function') {
            scannerJson = scannerResponse.text();
        } else if (scannerResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
            scannerJson = scannerResponse.candidates[0].content.parts[0].text;
        }

        if (scannerJson) {
            scannerJson = scannerJson.trim().replace(/```json/g, '').replace(/```/g, '');
            const parsed = JSON.parse(scannerJson);
            suspects = parsed.suspects || [];
        }
    } catch (err) {
        console.error('[Hypothesis Scanner] Pass 1 failed:', err);
        // Fall back to returning empty - don't crash the whole analysis
        return [];
    }

    console.log(`[Scanner] Found ${suspects.length} suspects`);

    if (suspects.length === 0) {
        console.log('[Hypothesis Scanner] No suspects found, skipping Pass 2');
        return [];
    }

    // ========================================
    // RAG SEARCH: Get candidates for all suspects
    // ========================================
    console.log(`[Hypothesis Scanner] Searching RAG for ${suspects.length} suspects...`);

    const ragResultsMap = new Map<number, RagCandidate[]>();

    // Batch all keyword searches in parallel
    const ragPromises = suspects.map(async (suspect, index) => {
        try {
            // Use searchHybrid with the suspect's keywords
            const results = await searchHybrid(
                suspect.snippet,
                suspect.searchKeywords,
                5  // Top 5 per suspect
            );
            return { index, results };
        } catch (err) {
            console.warn(`[Hypothesis Scanner] RAG search failed for suspect ${index}:`, err);
            return { index, results: [] };
        }
    });

    const ragResults = await Promise.all(ragPromises);
    for (const { index, results } of ragResults) {
        ragResultsMap.set(index, results);
    }

    // ========================================
    // PASS 2: LIBRARIAN - Verify and filter
    // ========================================
    console.log('[Hypothesis Scanner] Pass 2 (Librarian) starting...');

    const suspectsWithRag = formatSuspectsWithRagForLibrarian(suspects, ragResultsMap, textSegment);

    // Include GT-RAG in librarian pass (especially for REJECT examples)
    let gtBlockForLibrarian = '';
    if (userId) {
        const gtExamples = await searchGroundTruthByRelevance(textSegment, userId, 5); // Reduced from 10 for cost
        if (gtExamples.length > 0) {
            gtBlockForLibrarian = formatGroundTruthForChunk(gtExamples);
        }
    }

    const librarianContent = `${LIBRARIAN_PROMPT}\n${gtBlockForLibrarian}\n${suspectsWithRag}`;

    try {
        const librarianResponse = await generateContentWithRetry(ai.models, {
            model: model,
            contents: librarianContent,
            config: {
                maxOutputTokens: 4096,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        verifiedCitations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    source: { type: Type.STRING },
                                    snippet: { type: Type.STRING },
                                    contextBefore: { type: Type.STRING },
                                    contextAfter: { type: Type.STRING },
                                    justification: { type: Type.STRING },
                                    title: { type: Type.STRING },
                                    hebrewText: { type: Type.STRING },
                                    translation: { type: Type.STRING },
                                    isImplicit: { type: Type.BOOLEAN },
                                    pageNumber: { type: Type.INTEGER }
                                },
                                // COST FIX: Only require essential fields to prevent MAX_TOKENS
                                required: ["source", "snippet", "justification", "isImplicit"]
                            }
                        }
                    }
                }
            }
        });

        // Parse librarian response
        let librarianJson = '';
        if (typeof librarianResponse.text === 'string') {
            librarianJson = librarianResponse.text;
        } else if (typeof librarianResponse.text === 'function') {
            librarianJson = librarianResponse.text();
        } else if (librarianResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
            librarianJson = librarianResponse.candidates[0].content.parts[0].text;
        }

        if (librarianJson) {
            librarianJson = librarianJson.trim().replace(/```json/g, '').replace(/```/g, '');
            const parsed = JSON.parse(librarianJson);
            const verified = parsed.verifiedCitations || [];

            console.log(`[Librarian] Verified ${verified.length} citations (filtered ${suspects.length - verified.length})`);

            return verified;
        }
    } catch (err) {
        console.error('[Hypothesis Scanner] Pass 2 failed:', err);
    }

    return [];
}



/**
 * Analyzes a full text string for Talmudic references by chunking it and sending to AI.
 * Now supports per-chunk Ground Truth retrieval for "long-term memory".
 * 
 * @param fullText The full text to analyze
 * @param progressCallbackOrOptions Optional progress callback OR AnalysisOptions
 * @param userId Optional user ID for Ground Truth retrieval (legacy support)
 * @returns Array of AIFinding objects
 */
export const analyzeFullText = async (
    fullText: string,
    progressCallbackOrOptions?: ((processedChars: number, totalChars: number) => void) | AnalysisOptions,
    userId?: string
): Promise<AIFinding[]> => {

    // Handle both old signature (callback, userId) and new signature (AnalysisOptions)
    let options: AnalysisOptions = {};
    if (typeof progressCallbackOrOptions === 'function') {
        // Legacy call: analyzeFullText(text, progressCallback, userId)
        options = {
            progressCallback: progressCallbackOrOptions,
            userId: userId,
            enableHypothesisScanner: false
        };
    } else if (progressCallbackOrOptions) {
        // New call: analyzeFullText(text, options)
        options = progressCallbackOrOptions;
    }

    const {
        progressCallback,
        userId: optionsUserId,
        enableHypothesisScanner = false,
        dryRun = false,
        delayBetweenChunksMs = 2000,
        onCostEstimate
    } = options;
    const effectiveUserId = optionsUserId || userId;

    // Calculate cost estimate
    const costEstimate = estimateAnalysisCost(fullText);
    console.log(`[Text Analysis] Cost estimate:`, costEstimate);

    // Call cost estimate callback if provided
    if (onCostEstimate) {
        onCostEstimate(costEstimate);
    }

    // DRY RUN MODE: Return empty results without making API calls
    if (dryRun) {
        console.log(`[Text Analysis] DRY RUN MODE - Returning cost estimate without API calls`);
        console.log(`  - Chunks: ${costEstimate.chunks}`);
        console.log(`  - API calls (standard): ${costEstimate.apiCallsStandard}`);
        console.log(`  - API calls (deep scan): ${costEstimate.apiCallsDeepScan}`);
        console.log(`  - Estimated tokens (standard): ${costEstimate.estimatedTokensStandard.toLocaleString()}`);
        console.log(`  - Estimated tokens (deep scan): ${costEstimate.estimatedTokensDeepScan.toLocaleString()}`);
        return []; // Return empty array for dry run
    }

    console.log(`[Text Analysis] Starting analysis. Hypothesis Scanner: ${enableHypothesisScanner ? 'ENABLED' : 'disabled'}`);
    console.log(`[Text Analysis] Rate limiting: ${delayBetweenChunksMs}ms between chunks`);

    // Chunk size: 4000 chars (~1-2 pages) for high recall
    const chunks = [];
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
        chunks.push(fullText.substring(i, i + CHUNK_SIZE));
    }

    console.log(`Split text into ${chunks.length} chunks.`);
    let allFindings: any[] = [];
    let processedChars = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let chunkFindings: any[];

        // ========================================
        // CITATION PRE-FILTER: Detect references without LLM
        // ========================================
        const detectionResult = detectReferences(chunk);
        const localFindings = detectionResultToFindings(detectionResult, chunk);

        if (localFindings.length > 0) {
            console.log(`[Citation Detector] Found ${localFindings.length} references locally (FREE!)`);
            allFindings = [...allFindings, ...localFindings];
        }

        // Skip LLM if no likely citations detected (saves API cost)
        if (!detectionResult.hasLikelyCitations) {
            console.log(`[Pre-filter] Chunk ${i + 1}/${chunks.length}: No likely citations - skipping LLM`);
            processedChars += chunk.length;
            if (progressCallback) progressCallback(processedChars, fullText.length);
            continue;
        }

        console.log(`[Pre-filter] Chunk ${i + 1}/${chunks.length}: Likely citations detected`);

        // ========================================
        // GT PRE-FILTER: Check if we can skip LLM using Ground Truth
        // ========================================
        if (effectiveUserId && isPrefilterAvailable()) {
            const gtPrefilter = await prefilterWithGroundTruth(chunk, effectiveUserId);

            // Add any auto-generated findings from APPROVE patterns
            if (gtPrefilter.autoFindings.length > 0) {
                console.log(`[GT Pre-filter] ✅ Auto-added ${gtPrefilter.autoFindings.length} findings`);
                allFindings = [...allFindings, ...gtPrefilter.autoFindings];
            }

            // Skip LLM if GT says we should
            if (gtPrefilter.shouldSkipLLM) {
                console.log(`[GT Pre-filter] ⏭️ Skipping LLM for chunk ${i + 1}: ${gtPrefilter.reason}`);
                processedChars += chunk.length;
                if (progressCallback) progressCallback(processedChars, fullText.length);
                continue; // SKIP EXPENSIVE LLM CALL
            }
        }

        console.log(`[Pre-filter] Chunk ${i + 1}/${chunks.length}: Calling LLM...`);

        if (enableHypothesisScanner) {
            // 2-Pass: Scanner (high recall) -> Librarian (high precision)
            // Note: Hypothesis Scanner currently defaults to Gemini due to complexity, 
            // but we could adapt it for Dicta later if quality permits.
            if (options.provider === 'dicta') {
                console.warn("[Text Analysis] Hypothesis Scanner not fully optimized for Dicta yet, falling back to Standard Mode for Dicta.");
                chunkFindings = await processAnalyzeChunk(chunk, effectiveUserId, options.provider);
            } else {
                chunkFindings = await processChunkWithHypothesisScanner(chunk, effectiveUserId);
            }
        } else {
            // 1-Pass: Standard analysis with GT-RAG
            chunkFindings = await processAnalyzeChunk(chunk, effectiveUserId, options.provider);
        }

        allFindings = [...allFindings, ...chunkFindings];
        processedChars += chunk.length;
        if (progressCallback) progressCallback(processedChars, fullText.length);

        // Rate limiting: wait between chunks (except for the last one)
        if (i < chunks.length - 1 && delayBetweenChunksMs > 0) {
            console.log(`[Rate Limit] Waiting ${delayBetweenChunksMs}ms before next chunk...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunksMs));
        }
    }


    // Deduplicate logic
    const uniqueFindings = new Map();
    allFindings.forEach(f => {
        // Create unique key based on source + snippet start
        const key = `${f.source}-${f.snippet.substring(0, 20)}`;
        if (!uniqueFindings.has(key)) {
            uniqueFindings.set(key, f);
        }
    });

    // Convert to AIFinding type - ensure all fields have defaults to prevent Firebase 'undefined' errors
    return Array.from(uniqueFindings.values()).map((f: any, index: number) => {
        // Calculate source grounding offsets (LangExtract-inspired)
        const grounding = calculateSnippetOffsets(f.snippet || '', fullText);
        if (grounding) {
            console.log(`[Grounding] Snippet "${(f.snippet || '').substring(0, 40)}..." matched at chars ${grounding.startChar}-${grounding.endChar} (confidence: ${grounding.confidence})`);
        }

        return {
            id: crypto.randomUUID(),
            type: f.isImplicit ? 'thematic_fit' : 'reference', // Map isImplicit to finding type
            source: f.source || 'Unknown Source',
            snippet: f.snippet || '',
            contextBefore: f.contextBefore || '',
            contextAfter: f.contextAfter || '',
            justification: f.justification || '',
            title: f.title || 'Untitled Reference',
            hebrewText: f.hebrewText || '',
            translation: f.translation || '',
            pageNumber: f.pageNumber ?? 1,
            status: 'pending', // AIFindingStatus equivalent (assuming user imports are not mapped to enum here)
            confidence: 0.8,
            isImplicit: f.isImplicit ?? false,
            // Source Grounding fields
            snippetStartChar: grounding?.startChar,
            snippetEndChar: grounding?.endChar,
            matchConfidence: grounding?.confidence ?? 0
        } as any; // flexible casting to AIFinding since types might differ slightly in enum usage
    });
};

// Helper to process a single chunk with adaptive recursion AND per-chunk Ground Truth
const processAnalyzeChunk = async (textSegment: string, userId?: string, provider: AnalysisProvider = 'gemini'): Promise<any[]> => {
    let response: any = null;
    try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
        const model = 'gemini-2.5-flash';

        // ========================================
        // GROUND TRUTH RAG: Fetch relevant examples for THIS chunk
        // ========================================
        let groundTruthBlock = '';
        if (userId) {
            const relevantExamples = await searchGroundTruthByRelevance(textSegment, userId, 5); // Reduced from 10 for cost
            if (relevantExamples.length > 0) {
                groundTruthBlock = formatGroundTruthForChunk(relevantExamples);
                console.log(`[GT-RAG] Injecting ${relevantExamples.length} relevant corrections into prompt`);
            }
        }

        // ========================================
        // SEMANTIC CACHE: Check if we have a cached response for similar text
        // ========================================
        const cachedResponse = await checkCache(textSegment);
        if (cachedResponse) {
            console.log('[Cache] Using cached response - skipping LLM call');
            try {
                const parsed = JSON.parse(cachedResponse);
                return (parsed.foundReferences || []).map((ref: any) => ({
                    source: ref.source || '',
                    snippet: ref.snippet || '',
                    confidence: 95,
                    status: 'pending',
                    type: 'implicit',
                    justification: ref.justification || 'Retrieved from semantic cache',
                    hebrewText: ref.hebrewText || '',
                    pageNumber: ref.pageNumber
                }));
            } catch (e) {
                console.warn('[Cache] Failed to parse cached response, proceeding with LLM call');
            }
        }

        const chunkContent = `${BASE_PROMPT}${groundTruthBlock}${textSegment}`;

        // console.log(`Sending chunk of length ${textSegment.length} to AI...`);

        if (provider === 'dicta') {
            console.log('[Text Analysis] Using Dicta Local Model');
            const dictaResponse = await analyzeTextWithDicta(textSegment, BASE_PROMPT + groundTruthBlock);
            response = { text: dictaResponse }; // Mock response structure for unified parsing
        } else {
            response = await generateContentWithRetry(ai.models, {
                model: model,
                contents: chunkContent,
                config: {
                    maxOutputTokens: 8192, // Increased to prevent MAX_TOKENS chunking
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            foundReferences: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        source: { type: Type.STRING },
                                        snippet: { type: Type.STRING },
                                        contextBefore: { type: Type.STRING },
                                        contextAfter: { type: Type.STRING },
                                        justification: { type: Type.STRING },
                                        title: { type: Type.STRING },
                                        hebrewText: { type: Type.STRING },
                                        translation: { type: Type.STRING },
                                        isImplicit: { type: Type.BOOLEAN },
                                        pageNumber: { type: Type.INTEGER },
                                    },
                                    // COST FIX: Only require essential fields to prevent MAX_TOKENS
                                    // Optional fields (hebrewText, translation, etc.) can be fetched later from Sefaria
                                    required: ["source", "snippet", "justification", "isImplicit"]
                                }
                            }
                        }
                    }
                }
            });
        }

        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            throw new Error("AI response was empty. Finish Reason: MAX_TOKENS");
        }

        // Extract JSON
        let jsonString = "";
        try {
            if (typeof response.text === 'string') {
                jsonString = response.text;
            } else if (typeof response.text === 'function') {
                jsonString = response.text();
            } else if (response.response && typeof response.response.text === 'function') {
                jsonString = response.response.text();
            } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                jsonString = response.candidates[0].content.parts[0].text;
            }
        } catch (e) {
            console.error("Error calling text() method:", e);
        }

        if (!jsonString) {
            throw new Error("AI response was empty.");
        }

        jsonString = jsonString.trim().replace(/```json/g, '').replace(/```/g, '');
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }

        let results;
        try {
            results = JSON.parse(jsonString);
        } catch (parseError) {
            console.warn("JSON Parse Error. Attempting repair...", parseError);

            // Robust repair for truncated JSON
            let fixed = jsonString.trim();

            // 1. Check if we are inside a string
            const quoteCount = (fixed.match(/"/g) || []).length;
            const isInsideString = quoteCount % 2 !== 0;
            if (isInsideString) {
                fixed += '"';
            }

            // 2. Close open structures (simple suffixes attempt)
            const attempts = ['}', ']}', '}]}', '"}]}', '"]}'];
            let repaired = false;
            for (const suffix of attempts) {
                try {
                    results = JSON.parse(fixed + suffix);
                    repaired = true;
                    console.log(`JSON repaired with suffix: ${suffix}`);
                    break;
                } catch (e) { }
            }

            if (!repaired) {
                if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS' || fixed.length > 1000) {
                    throw new Error("MAX_TOKENS (JSON Parse Failed)");
                }
                throw parseError;
            }
        }

        // ========================================
        // SEMANTIC CACHE: Store successful response for future use
        // ========================================
        if (results?.foundReferences && results.foundReferences.length > 0) {
            cacheResponse(textSegment, jsonString).catch(console.error);
        }

        return results.foundReferences || [];

    } catch (err: any) {
        const isMaxTokens = err.message?.includes('MAX_TOKENS') ||
            response?.candidates?.[0]?.finishReason === 'MAX_TOKENS';

        if (isMaxTokens) {
            console.warn(`Chunk failed due to size/tokens. Length: ${textSegment.length}. Retrying with split...`);

            if (textSegment.length < 200) {
                console.error("Chunk too small to split further. Skipping.");
                return [];
            }

            const mid = Math.floor(textSegment.length / 2);
            let splitIndex = textSegment.lastIndexOf('\n', mid + 100);
            if (splitIndex === -1 || Math.abs(splitIndex - mid) > mid * 0.5) {
                splitIndex = textSegment.lastIndexOf(' ', mid + 100);
            }
            if (splitIndex === -1 || splitIndex < mid * 0.5 || splitIndex > mid * 1.5) {
                splitIndex = mid;
            }
            if (splitIndex <= 10 || splitIndex >= textSegment.length - 10) {
                splitIndex = mid;
            }

            const RECURSIVE_OVERLAP = 100;
            const startSecond = Math.max(0, splitIndex - RECURSIVE_OVERLAP);
            const endFirst = Math.min(textSegment.length, splitIndex + RECURSIVE_OVERLAP);
            const firstHalf = textSegment.substring(0, endFirst);
            const secondHalf = textSegment.substring(startSecond);

            const firstFindings = await processAnalyzeChunk(firstHalf, userId, provider);
            const secondFindings = await processAnalyzeChunk(secondHalf, userId, provider);
            return [...firstFindings, ...secondFindings];
        }
        throw err;
    }
};

/**
 * Analyzes text using Interactions API for server-side state management
 * Benefits: Server caches context, reduced redundant calls, better for long texts
 * 
 * @param fullText Full text to analyze
 * @param progressCallback Progress updates
 * @param sourceDocumentId Optional library text ID for linking findings
 */
export const analyzeTextWithInteractions = async (
    fullText: string,
    progressCallback?: (processedChars: number, totalChars: number) => void,
    sourceDocumentId?: string
): Promise<AIFinding[]> => {
    const sessionId = `analysis-${Date.now()}`;

    // Create session with analysis-specific system instruction
    createSession(sessionId, {
        model: 'gemini-2.5-flash',
        systemInstruction: BASE_PROMPT
    });

    // Chunk the text (smaller chunks for interactions to leverage caching)
    const CHUNK_SIZE = 6000; // Slightly larger since server handles better
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
        chunks.push(fullText.substring(i, i + CHUNK_SIZE));
    }

    console.log(`[Interactions Analysis] Starting with ${chunks.length} chunks`);

    let allFindings: any[] = [];
    let processedChars = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
            // Send chunk via Interactions API
            const result = await sendInteractionMessage(
                sessionId,
                `Analyze this text segment for Talmudic references. Return JSON with "foundReferences" array:\n\n${chunk}`
            );

            // Parse JSON response
            const text = result.text || '';
            const cleaned = text.trim().replace(/```json/g, '').replace(/```/g, '');
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace > firstBrace) {
                const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.foundReferences) {
                        allFindings = [...allFindings, ...parsed.foundReferences];
                    }
                } catch (e) {
                    console.warn(`[Interactions Analysis] JSON parse failed for chunk ${i + 1}`);
                }
            }

            processedChars += chunk.length;
            if (progressCallback) progressCallback(processedChars, fullText.length);

            console.log(`[Interactions Analysis] Completed chunk ${i + 1}/${chunks.length}, found ${allFindings.length} references so far`);
        } catch (error) {
            console.error(`[Interactions Analysis] Chunk ${i + 1} failed:`, error);
            // Continue with next chunk
        }
    }

    // Deduplicate
    const uniqueFindings = new Map();
    allFindings.forEach(f => {
        const key = `${f.source}-${(f.snippet || '').substring(0, 20)}`;
        if (!uniqueFindings.has(key)) {
            uniqueFindings.set(key, f);
        }
    });

    // Convert to AIFinding type with sourceDocumentId
    return Array.from(uniqueFindings.values()).map((f: any) => ({
        id: crypto.randomUUID(),
        type: f.isImplicit ? 'thematic_fit' : 'reference',
        source: f.source || 'Unknown Source',
        snippet: f.snippet || '',
        contextBefore: f.contextBefore || '',
        contextAfter: f.contextAfter || '',
        justification: f.justification || '',
        title: f.title || 'Untitled Reference',
        hebrewText: f.hebrewText || '',
        translation: f.translation || '',
        pageNumber: f.pageNumber ?? 1,
        status: 'pending',
        confidence: 0.8,
        isImplicit: f.isImplicit ?? false,
        sourceDocumentId // Link to library text for sync
    } as any));
};

/**
 * Smart analyzer that uses Interactions API if available, falls back to legacy
 * 
 * @param fullText Text to analyze
 * @param progressCallback Progress updates  
 * @param sourceDocumentId Optional library text ID
 */
export const analyzeTextSmart = async (
    fullText: string,
    progressCallback?: (processedChars: number, totalChars: number) => void,
    sourceDocumentId?: string
): Promise<AIFinding[]> => {
    if (isInteractionsAvailable()) {
        console.log('[Text Analysis] Using Interactions API (server-side state)');
        return analyzeTextWithInteractions(fullText, progressCallback, sourceDocumentId);
    } else {
        console.log('[Text Analysis] Using legacy chunked analysis');
        return analyzeFullText(fullText, progressCallback);
    }
};
