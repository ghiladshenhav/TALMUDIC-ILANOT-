/**
 * Sefaria Corpus Indexing Script - SENTENCE LEVEL
 * 
 * This script fetches the Babylonian Talmud from Sefaria's API,
 * SPLITS EACH PAGE INTO SENTENCES/SEGMENTS, generates embeddings 
 * for each segment, and uploads them to Pinecone.
 * 
 * This creates ~50-100k vectors instead of ~5k, enabling better
 * retrieval for short phrases like "עמא פזיזא".
 * 
 * Usage: npx ts-node --esm scripts/index-sefaria-sentences.ts
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configuration
const CONFIG = {
    // Sefaria API
    SEFARIA_BASE_URL: 'https://www.sefaria.org/api',

    // Tractates to index
    TRACTATES: [
        'Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Yoma',
        'Sukkah', 'Beitzah', 'Rosh Hashanah', 'Taanit', 'Megillah',
        'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot', 'Nedarim',
        'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma',
        'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot',
        'Avodah Zarah', 'Horayot', 'Zevachim', 'Menachot', 'Chullin',
        'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Niddah'
    ],

    // For testing, index just one tractate first
    TEST_MODE: true,
    TEST_TRACTATES: ['Ketubot'], // Contains "עמא פזיזא" on 112a

    // Pinecone
    PINECONE_INDEX_NAME: 'talmudic-corpus',
    PINECONE_NAMESPACE: 'sentences', // Use namespace to keep page-level index intact

    // Embedding
    EMBEDDING_MODEL: 'text-embedding-004',
    EMBEDDING_DIMENSION: 768,

    // Segmentation
    MIN_SEGMENT_LENGTH: 20,  // Minimum characters for a segment
    MAX_SEGMENT_LENGTH: 500, // Maximum characters per segment
    OVERLAP_CHARS: 50,       // Overlap between segments for context

    // Rate limiting
    DELAY_BETWEEN_REQUESTS_MS: 100,
    DELAY_BETWEEN_EMBEDS_MS: 50,
    BATCH_SIZE: 100, // Pinecone upsert batch size
};

interface SefariaSegment {
    ref: string;
    segmentIndex: number;
    hebrewText: string;
    englishText: string;
    parentRef: string;
}

interface IndexedDocument {
    id: string;
    values: number[];
    metadata: {
        ref: string;
        parentRef: string;
        segmentIndex: number;
        he: string;
        en: string;
        tractate: string;
    };
}

// Initialize clients
const pinecone = new Pinecone({
    apiKey: process.env.VITE_PINECONE_API_KEY || ''
});

const genai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY || '' });

/**
 * Split text into meaningful segments (sentences/clauses)
 * Uses a combination of punctuation-based splitting and length constraints
 */
function splitIntoSegments(text: string): string[] {
    if (!text || text.length < CONFIG.MIN_SEGMENT_LENGTH) {
        return text ? [text] : [];
    }

    // Split on Hebrew/Aramaic sentence boundaries
    // Common endings: period, colon (often used in Talmud), question mark
    // Also split on major structural words
    const splitPattern = /([.׃:?!]+\s+|(?<=\s)(?:אמר רבי|אמר ר'|תנו רבנן|תניא|מתני׳|גמ׳)(?=\s))/;

    const rawSegments = text.split(splitPattern).filter(s => s && s.trim().length > 0);

    // Merge very short segments and split very long ones
    const segments: string[] = [];
    let currentSegment = '';

    for (const raw of rawSegments) {
        const trimmed = raw.trim();

        if (!trimmed || trimmed.match(/^[.׃:?!]+$/)) {
            // Punctuation only - append to current segment
            currentSegment += trimmed + ' ';
            continue;
        }

        if (currentSegment.length + trimmed.length < CONFIG.MIN_SEGMENT_LENGTH) {
            // Too short - keep accumulating
            currentSegment += trimmed + ' ';
        } else if (currentSegment.length + trimmed.length > CONFIG.MAX_SEGMENT_LENGTH) {
            // Would be too long - save current and start new
            if (currentSegment.trim()) {
                segments.push(currentSegment.trim());
            }
            currentSegment = trimmed + ' ';
        } else {
            // Good size - save current and start new
            if (currentSegment.trim()) {
                segments.push(currentSegment.trim());
            }
            currentSegment = trimmed + ' ';
        }
    }

    // Don't forget the last segment
    if (currentSegment.trim().length >= CONFIG.MIN_SEGMENT_LENGTH) {
        segments.push(currentSegment.trim());
    } else if (segments.length > 0) {
        // Append to last segment if too short
        segments[segments.length - 1] += ' ' + currentSegment.trim();
    } else if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
    }

    return segments;
}

/**
 * Get all page refs for a tractate
 */
function getTractatePages(tractate: string): string[] {
    const PAGE_COUNTS: Record<string, number> = {
        'Berakhot': 64, 'Shabbat': 157, 'Eruvin': 105, 'Pesachim': 121, 'Yoma': 88,
        'Sukkah': 56, 'Beitzah': 40, 'Rosh Hashanah': 35, 'Taanit': 31, 'Megillah': 32,
        'Moed Katan': 29, 'Chagigah': 27, 'Yevamot': 122, 'Ketubot': 112, 'Nedarim': 91,
        'Nazir': 66, 'Sotah': 49, 'Gittin': 90, 'Kiddushin': 82, 'Bava Kamma': 119,
        'Bava Metzia': 119, 'Bava Batra': 176, 'Sanhedrin': 113, 'Makkot': 24, 'Shevuot': 49,
        'Avodah Zarah': 76, 'Horayot': 14, 'Zevachim': 120, 'Menachot': 110, 'Chullin': 142,
        'Bekhorot': 61, 'Arakhin': 34, 'Temurah': 34, 'Keritot': 28, 'Meilah': 22, 'Niddah': 73
    };

    const lastPage = PAGE_COUNTS[tractate] || 30;
    const pages: string[] = [];

    for (let i = 2; i <= lastPage; i++) {
        pages.push(`${tractate} ${i}a`);
        pages.push(`${tractate} ${i}b`);
    }

    return pages;
}

/**
 * Fetch a single page from Sefaria
 */
async function fetchPage(ref: string): Promise<{ he: string; en: string } | null> {
    try {
        const url = `${CONFIG.SEFARIA_BASE_URL}/texts/${encodeURIComponent(ref)}?context=0&pad=0`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`  Failed to fetch ${ref}: ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data.error) {
            console.warn(`  Sefaria error for ${ref}: ${data.error}`);
            return null;
        }

        const processText = (text: any): string => {
            if (!text) return '';
            const arr = Array.isArray(text) ? text.flat(10) : [text];
            return arr
                .filter(s => typeof s === 'string')
                .map(s => s.replace(/<[^>]*>/g, ''))
                .join(' ')
                .trim();
        };

        return {
            he: processText(data.he),
            en: processText(data.text)
        };
    } catch (error) {
        console.error(`  Error fetching ${ref}:`, error);
        return null;
    }
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const truncatedText = text.substring(0, 8000);

    const result = await genai.models.embedContent({
        model: CONFIG.EMBEDDING_MODEL,
        contents: truncatedText
    });

    return result.embeddings?.[0]?.values || [];
}

/**
 * Main indexing function
 */
async function indexCorpus(): Promise<void> {
    console.log('=== Sefaria SENTENCE-LEVEL Indexing ===\n');
    console.log(`Mode: ${CONFIG.TEST_MODE ? 'TEST (single tractate)' : 'FULL'}`);
    console.log(`Namespace: ${CONFIG.PINECONE_NAMESPACE}\n`);

    const index = pinecone.index(CONFIG.PINECONE_INDEX_NAME);
    const namespace = index.namespace(CONFIG.PINECONE_NAMESPACE);

    let totalSegments = 0;
    let totalFailed = 0;

    const tractates = CONFIG.TEST_MODE ? CONFIG.TEST_TRACTATES : CONFIG.TRACTATES;

    for (const tractate of tractates) {
        console.log(`\nProcessing tractate: ${tractate}`);
        const pages = getTractatePages(tractate);
        console.log(`  Total pages: ${pages.length}`);

        const documents: IndexedDocument[] = [];

        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const pageRef = pages[pageIdx];
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS_MS));

            const pageData = await fetchPage(pageRef);
            if (!pageData) {
                continue;
            }

            // Split Hebrew text into segments
            const hebrewSegments = splitIntoSegments(pageData.he);
            const englishSegments = splitIntoSegments(pageData.en);

            console.log(`  ${pageRef}: ${hebrewSegments.length} Hebrew segments`);

            // Create embeddings for each Hebrew segment
            for (let segIdx = 0; segIdx < hebrewSegments.length; segIdx++) {
                const heSegment = hebrewSegments[segIdx];
                const enSegment = englishSegments[segIdx] || '';

                try {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_EMBEDS_MS));

                    // Embed the Hebrew segment (optionally with English context)
                    const textForEmbedding = heSegment + (enSegment ? '\n' + enSegment : '');
                    const embedding = await generateEmbedding(textForEmbedding);

                    if (embedding.length === 0) {
                        totalFailed++;
                        continue;
                    }

                    const segmentRef = `${pageRef}:${segIdx + 1}`;

                    documents.push({
                        id: segmentRef.replace(/[\s:]/g, '_'),
                        values: embedding,
                        metadata: {
                            ref: segmentRef,
                            parentRef: pageRef,
                            segmentIndex: segIdx,
                            he: heSegment.substring(0, 5000), // Metadata size limit
                            en: enSegment.substring(0, 5000),
                            tractate
                        }
                    });

                    totalSegments++;

                    if (totalSegments % 50 === 0) {
                        console.log(`  Progress: ${totalSegments} segments indexed`);
                    }
                } catch (error) {
                    console.error(`  Failed to embed ${pageRef}:${segIdx}:`, error);
                    totalFailed++;
                }
            }

            // Batch upsert periodically to avoid memory issues
            if (documents.length >= CONFIG.BATCH_SIZE) {
                console.log(`  Upserting batch of ${documents.length} segments...`);
                await namespace.upsert(documents);
                documents.length = 0; // Clear array
            }
        }

        // Final upsert for this tractate
        if (documents.length > 0) {
            console.log(`  Upserting final ${documents.length} segments for ${tractate}...`);
            await namespace.upsert(documents);
        }
    }

    console.log('\n=== Indexing Complete ===');
    console.log(`Total segments indexed: ${totalSegments}`);
    console.log(`Total failed: ${totalFailed}`);
    console.log(`\nUse namespace "${CONFIG.PINECONE_NAMESPACE}" when querying.`);
}

// Run the script
indexCorpus().catch(console.error);
