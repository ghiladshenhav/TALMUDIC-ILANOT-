/**
 * Sefaria Corpus Indexing Script
 * 
 * This script fetches the Babylonian Talmud from Sefaria's API,
 * generates embeddings using Google's text-embedding-004, and
 * uploads them to Pinecone for RAG-based retrieval.
 * 
 * Usage: npx ts-node scripts/index-sefaria-corpus.ts
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

    // Tractates to index (start with a subset for POC)
    TRACTATES: [
        'Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Yoma',
        'Sukkah', 'Beitzah', 'Rosh Hashanah', 'Taanit', 'Megillah',
        'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot', 'Nedarim',
        'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma',
        'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot',
        'Avodah Zarah', 'Horayot', 'Zevachim', 'Menachot', 'Chullin',
        'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Niddah'
    ],

    // Pinecone
    PINECONE_INDEX_NAME: 'talmudic-corpus',

    // Embedding
    EMBEDDING_MODEL: 'text-embedding-004',
    EMBEDDING_DIMENSION: 768,

    // Rate limiting
    DELAY_BETWEEN_REQUESTS_MS: 100,
    BATCH_SIZE: 100, // Pinecone upsert batch size
};

interface SefariaSegment {
    ref: string;
    hebrewText: string;
    englishText: string;
}

interface IndexedDocument {
    id: string;
    values: number[];
    metadata: {
        ref: string;
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
 * Get all page refs for a tractate using known Bavli page counts
 */
function getTractatePages(tractate: string): string[] {
    // Bavli page counts (last page number for each tractate)
    const PAGE_COUNTS: Record<string, number> = {
        'Berakhot': 64, 'Shabbat': 157, 'Eruvin': 105, 'Pesachim': 121, 'Yoma': 88,
        'Sukkah': 56, 'Beitzah': 40, 'Rosh Hashanah': 35, 'Taanit': 31, 'Megillah': 32,
        'Moed Katan': 29, 'Chagigah': 27, 'Yevamot': 122, 'Ketubot': 112, 'Nedarim': 91,
        'Nazir': 66, 'Sotah': 49, 'Gittin': 90, 'Kiddushin': 82, 'Bava Kamma': 119,
        'Bava Metzia': 119, 'Bava Batra': 176, 'Sanhedrin': 113, 'Makkot': 24, 'Shevuot': 49,
        'Avodah Zarah': 76, 'Horayot': 14, 'Zevachim': 120, 'Menachot': 110, 'Chullin': 142,
        'Bekhorot': 61, 'Arakhin': 34, 'Temurah': 34, 'Keritot': 28, 'Meilah': 22, 'Niddah': 73
    };

    const lastPage = PAGE_COUNTS[tractate] || 30; // Default
    const pages: string[] = [];

    // Bavli starts at page 2 (daf bet)
    for (let i = 2; i <= lastPage; i++) {
        pages.push(`${tractate} ${i}a`);
        pages.push(`${tractate} ${i}b`);
    }

    console.log(`  Generated ${pages.length} page refs for ${tractate} (2a-${lastPage}b)`);
    return pages;
}

/**
 * Fetch a single page/amud from Sefaria
 */
async function fetchPage(ref: string): Promise<SefariaSegment | null> {
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

        // Process text (can be string or array of strings)
        const processText = (text: string | string[]): string => {
            if (!text) return '';
            const arr = Array.isArray(text) ? text : [text];
            return arr
                .map(s => (s || '').replace(/<[^>]*>/g, '')) // Strip HTML
                .join(' ')
                .trim();
        };

        const hebrewText = processText(data.he);
        const englishText = processText(data.text);

        if (!hebrewText && !englishText) {
            return null;
        }

        return {
            ref: data.ref || ref,
            hebrewText,
            englishText
        };
    } catch (error) {
        console.error(`  Error fetching ${ref}:`, error);
        return null;
    }
}

/**
 * Generate embedding for text using Google's embedding model
 */
async function generateEmbedding(text: string): Promise<number[]> {
    // Truncate to avoid token limits
    const truncatedText = text.substring(0, 8000);

    const result = await genai.models.embedContent({
        model: CONFIG.EMBEDDING_MODEL,
        contents: truncatedText
    });

    return result.embeddings?.[0]?.values || [];
}

/**
 * Create or get Pinecone index
 */
async function ensureIndex(): Promise<void> {
    const existingIndexes = await pinecone.listIndexes();
    const indexNames = existingIndexes.indexes?.map(i => i.name) || [];

    if (!indexNames.includes(CONFIG.PINECONE_INDEX_NAME)) {
        console.log(`Creating Pinecone index: ${CONFIG.PINECONE_INDEX_NAME}`);
        await pinecone.createIndex({
            name: CONFIG.PINECONE_INDEX_NAME,
            dimension: CONFIG.EMBEDDING_DIMENSION,
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        });

        // Wait for index to be ready
        console.log('Waiting for index to be ready...');
        await new Promise(resolve => setTimeout(resolve, 60000));
    } else {
        console.log(`Index ${CONFIG.PINECONE_INDEX_NAME} already exists`);
    }
}

/**
 * Upsert documents to Pinecone in batches
 */
async function upsertBatch(documents: IndexedDocument[]): Promise<void> {
    const index = pinecone.index(CONFIG.PINECONE_INDEX_NAME);

    for (let i = 0; i < documents.length; i += CONFIG.BATCH_SIZE) {
        const batch = documents.slice(i, i + CONFIG.BATCH_SIZE);
        await index.upsert(batch);
        console.log(`  Upserted batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(documents.length / CONFIG.BATCH_SIZE)}`);
    }
}

/**
 * Main indexing function
 */
async function indexCorpus(): Promise<void> {
    console.log('=== Sefaria Corpus Indexing ===\n');

    // 1. Ensure Pinecone index exists
    await ensureIndex();

    let totalIndexed = 0;
    let totalFailed = 0;

    // 2. Process each tractate
    for (const tractate of CONFIG.TRACTATES) {
        console.log(`\nProcessing tractate: ${tractate}`);

        // Fetch page list
        const pages = getTractatePages(tractate);
        const documents: IndexedDocument[] = [];

        // Fetch and embed each page
        for (const pageRef of pages) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS_MS));

            const segment = await fetchPage(pageRef);
            if (!segment) {
                totalFailed++;
                continue;
            }

            // Combine Hebrew and English for embedding (multilingual model)
            const textForEmbedding = `${segment.hebrewText}\n\n${segment.englishText}`;

            try {
                const embedding = await generateEmbedding(textForEmbedding);

                documents.push({
                    id: segment.ref.replace(/\s+/g, '_'),
                    values: embedding,
                    metadata: {
                        ref: segment.ref,
                        he: segment.hebrewText.substring(0, 10000), // Metadata size limit
                        en: segment.englishText.substring(0, 10000),
                        tractate
                    }
                });

                totalIndexed++;

                if (totalIndexed % 10 === 0) {
                    console.log(`  Progress: ${totalIndexed} pages indexed`);
                }
            } catch (error) {
                console.error(`  Failed to embed ${pageRef}:`, error);
                totalFailed++;
            }
        }

        // Upsert batch for this tractate
        if (documents.length > 0) {
            console.log(`  Upserting ${documents.length} documents for ${tractate}...`);
            await upsertBatch(documents);
        }
    }

    console.log('\n=== Indexing Complete ===');
    console.log(`Total indexed: ${totalIndexed}`);
    console.log(`Total failed: ${totalFailed}`);
}

// Run the script
indexCorpus().catch(console.error);
