/**
 * Branch Indexing Script
 * 
 * This script fetches all branch nodes from Firebase Firestore,
 * generates embeddings using Google's text-embedding-004, and
 * uploads them to Pinecone for similarity-based retrieval.
 * 
 * Usage: npx ts-node scripts/index-branches.ts
 * 
 * Note: Uses Firebase Admin SDK which requires a service account JSON file.
 * If no service account file is available, it will use REST API with the Firebase API key.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configuration
const CONFIG = {
    // Firebase REST API (using the web client approach since Admin SDK needs service account)
    FIREBASE_PROJECT_ID: 'talmudic-reception-trees',
    FIREBASE_BASE_URL: 'https://firestore.googleapis.com/v1',

    // Pinecone
    PINECONE_INDEX_NAME: 'talmudic-corpus',
    NAMESPACE: 'branches', // Separate namespace for branches

    // Embedding
    EMBEDDING_MODEL: 'text-embedding-004',
    EMBEDDING_DIMENSION: 768,

    // Rate limiting
    DELAY_BETWEEN_REQUESTS_MS: 100,
    BATCH_SIZE: 100, // Pinecone upsert batch size
};

interface BranchDocument {
    id: string;
    author: string;
    workTitle: string;
    publicationDetails: string;
    year?: string;
    referenceText: string;
    userNotes: string;
    category?: string;
    keywords?: string[];
    // Parent tree info
    treeId: string;
    rootSourceText?: string;
}

interface IndexedBranch {
    id: string;
    values: number[];
    metadata: {
        branchId: string;
        treeId: string;
        author: string;
        workTitle: string;
        year: string;
        referenceText: string;
        rootSourceText: string;
        category: string;
        keywords: string; // Stored as comma-separated string for Pinecone filtering
        // Preview of the content for display
        textPreview: string;
    };
}

// Initialize clients
const pinecone = new Pinecone({
    apiKey: process.env.VITE_PINECONE_API_KEY || ''
});

const genai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY || '' });

/**
 * Fetch all reception trees from Firestore using REST API
 * This approach doesn't require a service account
 */
async function fetchAllTrees(): Promise<any[]> {
    const url = `${CONFIG.FIREBASE_BASE_URL}/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/receptionTrees`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch trees: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.documents || [];
}

/**
 * Parse Firestore document format into our structure
 */
function parseFirestoreDoc(doc: any): { id: string; root: any; branches: any[] } | null {
    try {
        const fields = doc.fields;
        if (!fields) return null;

        // Extract document ID from the name path
        const nameParts = doc.name.split('/');
        const id = nameParts[nameParts.length - 1];

        // Parse root node
        const root = fields.root?.mapValue?.fields || {};
        const rootSourceText = root.sourceText?.stringValue || '';
        const rootTitle = root.title?.stringValue || '';

        const branchesArray = fields.branches?.arrayValue?.values || [];
        const branches = branchesArray.map((b: any) => {
            const bf = b.mapValue?.fields || {};
            // Parse keywords array if present
            const keywordsArray = bf.keywords?.arrayValue?.values || [];
            const keywords = keywordsArray.map((k: any) => k.stringValue || '').filter(Boolean);

            return {
                id: bf.id?.stringValue || '',
                author: bf.author?.stringValue || '',
                workTitle: bf.workTitle?.stringValue || '',
                publicationDetails: bf.publicationDetails?.stringValue || '',
                year: bf.year?.stringValue || '',
                referenceText: bf.referenceText?.stringValue || '',
                userNotes: bf.userNotes?.stringValue || '',
                category: bf.category?.stringValue || '',
                keywords: keywords,
                treeId: id,
                rootSourceText: rootSourceText,
                rootTitle: rootTitle
            };
        });

        return { id, root: { sourceText: rootSourceText, title: rootTitle }, branches };
    } catch (error) {
        console.error('Error parsing document:', error);
        return null;
    }
}

/**
 * Generate embedding for text
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
 * Create the text content to embed for a branch
 * Combines all relevant fields for semantic search
 */
function createEmbeddingText(branch: BranchDocument): string {
    const parts = [
        branch.author,
        branch.workTitle,
        branch.referenceText,
        branch.userNotes,
        branch.rootSourceText || '',
        branch.year || '',
        branch.category || ''
    ].filter(Boolean);

    return parts.join('\n\n');
}

/**
 * Upsert batch of documents to Pinecone
 */
async function upsertBatch(documents: IndexedBranch[]): Promise<void> {
    const index = pinecone.index(CONFIG.PINECONE_INDEX_NAME);

    await index.namespace(CONFIG.NAMESPACE).upsert(documents);
}

/**
 * Main indexing function
 */
async function indexBranches(): Promise<void> {
    console.log('=== Branch Indexing ===\n');

    // Check if index exists
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(idx => idx.name === CONFIG.PINECONE_INDEX_NAME);

    if (!indexExists) {
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

    // Fetch all trees from Firebase
    console.log('\nFetching reception trees from Firebase...');
    const firebaseDocs = await fetchAllTrees();
    console.log(`Found ${firebaseDocs.length} reception trees`);

    let allBranches: BranchDocument[] = [];

    // Parse and collect all branches
    for (const doc of firebaseDocs) {
        const parsed = parseFirestoreDoc(doc);
        if (parsed && parsed.branches.length > 0) {
            allBranches = allBranches.concat(parsed.branches);
        }
    }

    console.log(`Total branches to index: ${allBranches.length}`);

    if (allBranches.length === 0) {
        console.log('No branches found to index.');
        return;
    }

    // Index branches in batches
    const indexedDocs: IndexedBranch[] = [];
    let indexed = 0;
    let failed = 0;

    for (const branch of allBranches) {
        try {
            // Skip if no meaningful content
            const embeddingText = createEmbeddingText(branch);
            if (embeddingText.trim().length < 20) {
                console.log(`Skipping branch ${branch.id} - insufficient content`);
                continue;
            }

            // Generate embedding
            const embedding = await generateEmbedding(embeddingText);

            if (embedding.length === 0) {
                console.log(`Skipping branch ${branch.id} - embedding failed`);
                failed++;
                continue;
            }

            // Create indexed document
            const indexedDoc: IndexedBranch = {
                id: `branch-${branch.id}`,
                values: embedding,
                metadata: {
                    branchId: branch.id,
                    treeId: branch.treeId,
                    author: branch.author || 'Unknown',
                    workTitle: branch.workTitle || '',
                    year: branch.year || '',
                    referenceText: branch.referenceText.substring(0, 500),
                    rootSourceText: branch.rootSourceText || '',
                    category: branch.category || '',
                    keywords: (branch.keywords || []).join(','),
                    textPreview: embeddingText.substring(0, 300)
                }
            };

            indexedDocs.push(indexedDoc);
            indexed++;

            if (indexed % 10 === 0) {
                console.log(`  Progress: ${indexed} branches indexed`);
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS_MS));

            // Upsert in batches
            if (indexedDocs.length >= CONFIG.BATCH_SIZE) {
                console.log(`  Upserting batch of ${indexedDocs.length} documents...`);
                await upsertBatch(indexedDocs);
                indexedDocs.length = 0; // Clear array
            }

        } catch (error) {
            console.error(`Error indexing branch ${branch.id}:`, error);
            failed++;
        }
    }

    // Upsert remaining documents
    if (indexedDocs.length > 0) {
        console.log(`  Upserting final batch of ${indexedDocs.length} documents...`);
        await upsertBatch(indexedDocs);
    }

    console.log('\n=== Indexing Complete ===');
    console.log(`Total indexed: ${indexed}`);
    console.log(`Total failed: ${failed}`);
}

// Run the indexing
indexBranches().catch(console.error);
