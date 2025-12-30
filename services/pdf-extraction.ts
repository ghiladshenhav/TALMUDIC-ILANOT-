import { GoogleGenAI } from "@google/genai";
import { AIFinding, AIFindingType, AIFindingStatus } from '../types';

// Initialize with existing VITE key
const getAI = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export interface ExtractedCitation {
    source: string;       // e.g., "Bavli Berakhot 2a"
    snippet: string;      // The German context or Hebrew quote
    justification: string; // Why the AI thinks this is a match
    pageNumber: number;
    hebrewText?: string;
    translation?: string;
    isImplicit?: boolean;
}

/**
 * Convert File to Base64 (required for Gemini API in browser)
 */
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Transcribe full PDF text using Gemini's vision capabilities.
 * For long documents, makes multiple requests to avoid token limits.
 * 
 * @param file The PDF file to transcribe
 * @param progressCallback Optional callback for progress updates
 * @returns The full transcribed text with page markers
 */
export async function transcribePdfText(
    file: File,
    progressCallback?: (message: string) => void
): Promise<string> {
    const ai = getAI();
    const base64Data = await fileToBase64(file);
    const model = 'gemini-2.0-flash-exp';

    // For long PDFs, we need to transcribe in chunks
    // Strategy: Ask for chunks and provide context from last chunk to continue
    const PAGES_PER_BATCH = 15; // Increased for better context

    const transcribePageRange = async (startPage: number, endPage: number, lastContext: string): Promise<string> => {
        // Use continuation context to help model know where to continue from
        const contextInstruction = lastContext
            ? `\nIMPORTANT: You previously transcribed up to this text:\n"...${lastContext.slice(-200)}"\n\nNow CONTINUE from where you left off. Do NOT repeat the text above.`
            : '';

        const prompt = `You are a document transcription assistant. Transcribe approximately pages ${startPage} to ${endPage} of this PDF.${contextInstruction}

CRITICAL INSTRUCTIONS:
1. Transcribe text from approximately pages ${startPage} to ${endPage}
2. Include ALL elements:
   - Main body text
   - Footnotes (very important!)
   - Headers and page numbers
   - Margin notes
   
3. Handle MIXED SCRIPTS:
   - Transcribe German text accurately (handle both Fraktur and Antiqua fonts)
   - Transcribe Hebrew/Aramaic text in the correct reading direction
   - Preserve the original language (do NOT translate)

4. FORMAT:
   - Mark page breaks with: [[PAGE_X]] where X is the page number
   - Keep paragraphs separated by blank lines
   - Preserve footnote numbering (e.g., "¹", "²" or "(1)", "(2)")

5. QUALITY:
   - Be as accurate as possible
   - If a word is unclear, make your best guess and mark uncertainty with [?]
   - Preserve any special characters or diacritical marks

6. AT THE END:
   - If there are MORE pages after page ${endPage}, add the marker: [[MORE_PAGES_EXIST]]
   - If this is the last page of the document, add the marker: [[END_OF_DOCUMENT]]

Return ONLY the transcribed text, no commentary or explanation.`;

        // Retry logic with exponential backoff for rate limiting
        const MAX_RETRIES = 3;
        let lastError: any = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await ai.models.generateContent({
                    model: model,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: "application/pdf",
                                        data: base64Data
                                    }
                                }
                            ]
                        }
                    ],
                    config: {
                        maxOutputTokens: 32768
                    }
                });

                let responseText = '';
                try {
                    if (result.text) {
                        responseText = String(result.text);
                    } else if ((result as any).candidates?.[0]?.content?.parts?.[0]?.text) {
                        responseText = (result as any).candidates[0].content.parts[0].text;
                    }
                } catch (e) {
                    console.warn('[PDF Vision] Error extracting text from response:', e);
                }

                return responseText;

            } catch (error: any) {
                lastError = error;
                const isRateLimited = error.message?.includes('429') ||
                    error.message?.includes('RESOURCE_EXHAUSTED') ||
                    error.message?.includes('quota');

                if (isRateLimited && attempt < MAX_RETRIES) {
                    // Exponential backoff: 5s, 15s, 45s
                    const waitTime = 5000 * Math.pow(3, attempt - 1);
                    console.log(`[PDF Vision] Rate limited. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
                    progressCallback?.(`Rate limited. Waiting ${waitTime / 1000}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else if (!isRateLimited) {
                    // Non-rate-limit error, don't retry
                    throw error;
                }
            }
        }

        // All retries exhausted
        throw lastError;
    };

    try {
        console.log('[PDF Vision] Starting chunked transcription...');
        let fullText = '';
        let currentBatch = 1;
        const MAX_BATCHES = 10; // Safety limit: max 100 pages

        // Simple approach: keep going until we get an empty/tiny response
        // Track last transcribed text to provide context for continuation
        let lastContext = '';

        while (currentBatch <= MAX_BATCHES) {
            const startPage = (currentBatch - 1) * PAGES_PER_BATCH + 1;
            const endPage = currentBatch * PAGES_PER_BATCH;

            progressCallback?.(`Transcribing pages ${startPage}-${endPage}...`);
            console.log(`[PDF Vision] Batch ${currentBatch}: pages ${startPage}-${endPage}`);

            const batchText = await transcribePageRange(startPage, endPage, lastContext);

            // Clean markers
            const cleanBatch = batchText
                .replace(/\[\[END_OF_DOCUMENT\]\]/g, '')
                .replace(/\[\[MORE_PAGES_EXIST\]\]/g, '')
                .trim();

            console.log(`[PDF Vision] Batch ${currentBatch} returned ${cleanBatch.length} chars`);

            // If batch is substantial (> 500 chars), add it and continue
            if (cleanBatch.length > 500) {
                fullText += cleanBatch + '\n\n';
                lastContext = cleanBatch; // Save for next batch context
                currentBatch++;

                // If model explicitly says end, respect it
                if (batchText.includes('[[END_OF_DOCUMENT]]')) {
                    console.log(`[PDF Vision] Model indicated end of document at batch ${currentBatch - 1}`);
                    break;
                }

                // Delay between requests to avoid rate limiting (2 seconds)
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                // Batch too short - no more meaningful content
                if (cleanBatch.length > 0) {
                    fullText += cleanBatch; // Still add whatever we got
                }
                console.log(`[PDF Vision] Batch ${currentBatch} too short (${cleanBatch.length} chars), stopping`);
                break;
            }
        }

        if (currentBatch > MAX_BATCHES) {
            console.log(`[PDF Vision] Reached max batch limit (${MAX_BATCHES})`);
            progressCallback?.(`Note: Document truncated at ${MAX_BATCHES * PAGES_PER_BATCH} pages`);
        }

        console.log(`[PDF Vision] Transcription complete, ${fullText.length} characters from ${currentBatch} batch(es)`);
        return fullText;
    } catch (error: any) {
        console.error('[PDF Vision] Transcription error:', error);
        throw new Error(`PDF transcription failed: ${error.message}`);
    }
}

export interface PdfAnalysisResult {
    transcribedText: string;
    citations: ExtractedCitation[];
}

/**
 * Full PDF analysis: transcribe text first, then extract citations.
 * This provides the full text for user review alongside findings.
 */
export async function analyzePdfComplete(
    file: File,
    progressCallback?: (stage: string) => void
): Promise<PdfAnalysisResult> {
    // Stage 1: Transcribe full text (with progress updates)
    progressCallback?.('Transcribing PDF text...');
    const transcribedText = await transcribePdfText(file, progressCallback);

    // Stage 2: Extract citations
    progressCallback?.('Extracting citations...');
    const citations = await extractCitationsFromPdf(file, undefined);

    return { transcribedText, citations };
}

/**
 * Analyze PDF using FREE Tesseract OCR.
 * ⚠️ Only transcribes text - does NOT extract citations automatically.
 * Use this to save API costs, then run text analysis separately via analyzeFullText().
 * 
 * @param file PDF file to process
 * @param language Tesseract language(s): 'heb', 'deu', 'frk', 'heb+deu', etc.
 * @param progressCallback Progress updates
 * @returns Transcribed text only (no citations - run text analysis separately)
 */
export async function analyzePdfWithTesseract(
    file: File,
    language: 'heb' | 'deu' | 'frk' | 'heb+deu' | 'heb+frk' | 'deu+frk' | 'heb+deu+frk' = 'heb+deu',
    progressCallback?: (stage: string) => void
): Promise<PdfAnalysisResult> {
    // Import Tesseract dynamically to avoid bundle size impact when not used
    const { performPdfOCR } = await import('../utils/tesseract-ocr');

    progressCallback?.('📖 Transcribing with Tesseract (FREE)...');
    console.log(`[PDF Tesseract] Starting FREE OCR for: ${file.name}, language: ${language}`);

    const transcribedText = await performPdfOCR(file, language, progressCallback);

    console.log(`[PDF Tesseract] Transcribed ${transcribedText.length} characters`);
    progressCallback?.(`✅ Transcribed ${transcribedText.length} characters (FREE)`);

    // Return empty citations - user should run text analysis separately via Analyzer
    return {
        transcribedText,
        citations: [] // No AI citation extraction in Tesseract mode - saves API costs
    };
}

/**
 * Extract Talmudic citations from a PDF using Gemini's vision capabilities.
 * Sends the PDF directly to the model - no OCR needed.
 * 
 * @param file The PDF file to analyze
 * @param progressCallback Optional callback for multi-page progress
 * @returns Array of extracted citations
 */
export async function extractCitationsFromPdf(
    file: File,
    progressCallback?: (currentPage: number, totalPages: number) => void
): Promise<ExtractedCitation[]> {
    const ai = getAI();
    const base64Data = await fileToBase64(file);

    // Model with vision capabilities
    const model = 'gemini-2.0-flash-exp';

    const prompt = `You are a scholar analyzing a German-Jewish history document with mixed German and Hebrew text.

TASK: Extract ALL Talmudic and Rabbinic references from this document.

CRITICAL INSTRUCTIONS:
1. Search the ENTIRE document including:
   - Main body text
   - FOOTNOTES (often at bottom of page - these contain the most citations)
   - Margin notes
   - Hebrew/Aramaic quotes embedded in German text

2. Handle MIXED SCRIPTS:
   - German text (may be in Fraktur or Antiqua font)
   - Hebrew text (may have nikud/vowel marks)
   - Aramaic passages

3. RESOLVE ABBREVIATIONS:
   - "b." or "Bab." → "Bavli"
   - "j." or "Jer." or "Pal." → "Yerushalmi"
   - "M." or "Misch." → "Mishnah"
   - German abbreviations for tractates

4. CITATION FORMAT (MANDATORY):
   - Use: "[Corpus] [Tractate] [Page/Chapter]"
   - Examples: "Bavli Shabbat 21b", "Mishnah Berakhot 1:1", "Yerushalmi Peah 2:4"
   - NEVER use generic "Talmud" or "the Gemara"

5. For EACH reference found, provide:
   - source: The standardized citation
   - snippet: The German/Hebrew sentence where it appears (exact quote from document)
   - justification: Where in the document (e.g., "Footnote 4", "Page body, paragraph 2")
   - hebrewText: Any Hebrew/Aramaic text quoted (if present)
   - translation: English translation of the Hebrew (if you can provide)
   - isImplicit: true if this is an allusion rather than explicit citation
   - pageNumber: The page number in the PDF (if visible)

Return a JSON array of objects. If no references found, return an empty array [].

EXAMPLE OUTPUT:
[
  {
    "source": "Bavli Shabbat 21b",
    "snippet": "Wie in Schabbat 21b erläutert wird...",
    "justification": "Footnote 3, explicit citation",
    "hebrewText": "מאי חנוכה",
    "translation": "What is Hanukkah?",
    "isImplicit": false,
    "pageNumber": 42
  }
]`;

    try {
        console.log('[PDF Vision] Sending PDF to Gemini for analysis...');

        const result = await ai.models.generateContent({
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: "application/pdf",
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            config: {
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        });

        // Extract text from response - handle various response formats
        let responseText = '';
        try {
            // result.text is a getter property, not a function
            if (result.text) {
                responseText = String(result.text);
            } else if ((result as any).candidates?.[0]?.content?.parts?.[0]?.text) {
                responseText = (result as any).candidates[0].content.parts[0].text;
            }
        } catch (e) {
            console.warn('[PDF Vision] Error extracting text from response:', e);
        }

        console.log('[PDF Vision] Response received, parsing...');

        // Clean and parse JSON
        let jsonString = responseText.trim()
            .replace(/```json/g, '')
            .replace(/```/g, '');

        const firstBracket = jsonString.indexOf('[');
        const lastBracket = jsonString.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            jsonString = jsonString.substring(firstBracket, lastBracket + 1);
        }

        const citations: ExtractedCitation[] = JSON.parse(jsonString || '[]');
        console.log(`[PDF Vision] Found ${citations.length} citations`);

        return citations;

    } catch (error: any) {
        console.error('[PDF Vision] Error:', error);
        throw new Error(`PDF analysis failed: ${error.message}`);
    }
}

/**
 * Convert extracted citations to AIFinding objects for use in the existing workflow.
 * Fetches Hebrew text and translation from Sefaria if not provided by AI.
 */
export async function citationsToFindings(
    citations: ExtractedCitation[],
    workTitle: string,
    author: string,
    sourceDocumentId?: string
): Promise<AIFinding[]> {
    const findings: AIFinding[] = [];

    for (let index = 0; index < citations.length; index++) {
        const citation = citations[index];

        // If Hebrew text or translation is missing, try to fetch from Sefaria
        let hebrewText = citation.hebrewText || '';
        let translation = citation.translation || '';

        if (!hebrewText && citation.source) {
            try {
                console.log(`[PDF Vision] Fetching source text for: ${citation.source}`);
                const sefariaResult = await fetchSefariaText(citation.source);
                if (sefariaResult) {
                    hebrewText = sefariaResult.he || '';
                    translation = sefariaResult.en || '';
                }
            } catch (e) {
                console.warn(`[PDF Vision] Could not fetch Sefaria text for ${citation.source}:`, e);
            }
        }

        findings.push({
            id: `pdf-finding-${crypto.randomUUID()}-${index}`,
            type: citation.isImplicit ? AIFindingType.ThematicFit : AIFindingType.Reference,
            status: AIFindingStatus.Pending,
            confidence: 0.85,
            source: citation.source || 'Unknown Source',
            snippet: citation.snippet || '',
            contextBefore: '',
            contextAfter: '',
            justification: citation.justification || `Page ${citation.pageNumber || '?'}, ${citation.isImplicit ? 'implicit' : 'explicit'} citation`,
            hebrewText: hebrewText,
            translation: translation,
            pageNumber: citation.pageNumber || 1,
            isImplicit: citation.isImplicit || false,
            workTitle: workTitle,
            author: author,
            sourceDocumentId: sourceDocumentId
        });
    }

    return findings;
}

/**
 * Simple Sefaria API fetch for a given reference
 */
async function fetchSefariaText(ref: string): Promise<{ he: string, en: string } | null> {
    try {
        // Convert reference format (e.g., "Bavli Berakhot 2a" -> "Berakhot.2a")
        const sefariaRef = convertToSefariaRef(ref);
        const response = await fetch(`https://www.sefaria.org/api/texts/${encodeURIComponent(sefariaRef)}?context=0`);
        if (!response.ok) return null;

        const data = await response.json();

        // Extract first segment of text
        const heText = Array.isArray(data.he) ? data.he.flat().slice(0, 3).join(' ') : (data.he || '');
        const enText = Array.isArray(data.text) ? data.text.flat().slice(0, 3).join(' ') : (data.text || '');

        return { he: heText, en: enText };
    } catch (e) {
        return null;
    }
}

/**
 * Convert standard Talmudic reference to Sefaria API format
 */
function convertToSefariaRef(ref: string): string {
    // Remove corpus prefixes
    let sefariaRef = ref
        .replace(/^Bavli\s+/i, '')
        .replace(/^Yerushalmi\s+/i, 'Jerusalem Talmud ')
        .replace(/^Mishnah\s+/i, 'Mishnah ')
        .replace(/^Tosefta\s+/i, 'Tosefta ');

    // Replace space before page number with dot
    sefariaRef = sefariaRef.replace(/\s+(\d+[ab]?)$/, '.$1');

    return sefariaRef;
}

