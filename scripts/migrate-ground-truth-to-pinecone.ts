/**
 * Migration Script: Backfill Ground Truth Examples to Pinecone
 * 
 * This one-time script indexes all existing ground_truth_examples from Firestore
 * into Pinecone's 'ground-truth' namespace for semantic retrieval.
 * 
 * Usage: npx tsx scripts/migrate-ground-truth-to-pinecone.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Firebase config (same as firebase.ts but with process.env)
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: "talmudic-reception-trees.firebaseapp.com",
    projectId: "talmudic-reception-trees",
    storageBucket: "talmudic-reception-trees.firebasestorage.app",
    messagingSenderId: "1081944959110",
    appId: "1:1081944959110:web:a3220fde47189f8e7e4907"
};

// Configuration
const CONFIG = {
    PINECONE_INDEX_NAME: 'talmudic-corpus',
    PINECONE_NAMESPACE: 'ground-truth',
    EMBEDDING_MODEL: 'text-embedding-004',
    BATCH_SIZE: 50
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.VITE_PINECONE_API_KEY!
});

// Initialize Gemini for embeddings
const genai = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY!);

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const truncated = text.substring(0, 8000);
    const model = genai.getGenerativeModel({ model: CONFIG.EMBEDDING_MODEL });
    const result = await model.embedContent(truncated);
    return result.embedding.values;
}

/**
 * Main migration function
 */
async function migrate() {
    console.log('==========================================');
    console.log('Ground Truth Migration to Pinecone');
    console.log('==========================================\n');

    // 1. Fetch all ground truth examples from Firestore
    console.log('[1/4] Fetching Ground Truth examples from Firestore...');
    const snapshot = await getDocs(collection(db, 'ground_truth_examples'));

    if (snapshot.empty) {
        console.log('❌ No Ground Truth examples found in Firestore. Nothing to migrate.');
        return;
    }

    console.log(`✅ Found ${snapshot.size} examples to migrate.\n`);

    // 2. Get Pinecone index
    console.log('[2/4] Connecting to Pinecone...');
    const index = pinecone.index(CONFIG.PINECONE_INDEX_NAME);
    console.log(`✅ Connected to index: ${CONFIG.PINECONE_INDEX_NAME}\n`);

    // 3. Process in batches
    console.log('[3/4] Generating embeddings and upserting to Pinecone...');
    const docs = snapshot.docs;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < docs.length; i += CONFIG.BATCH_SIZE) {
        const batch = docs.slice(i, i + CONFIG.BATCH_SIZE);
        const vectors: any[] = [];

        for (const doc of batch) {
            try {
                const data = doc.data();
                const phrase = data.phrase || '';
                const snippet = data.snippet || '';
                const textToEmbed = `${phrase} ${snippet}`;

                if (!textToEmbed.trim()) {
                    console.warn(`  ⚠️ Skipping ${doc.id}: empty phrase/snippet`);
                    continue;
                }

                // Generate embedding
                const embedding = await generateEmbedding(textToEmbed);

                vectors.push({
                    id: doc.id,
                    values: embedding,
                    metadata: {
                        userId: data.userId || '',
                        phrase: (data.phrase || '').substring(0, 500),
                        snippet: (data.snippet || '').substring(0, 1000),
                        action: (data.action || '').toString(),
                        correctSource: data.correctSource || '',
                        originalSource: data.originalSource || '',
                        correctionReason: (data.correctionReason || '').substring(0, 500),
                        errorType: data.errorType || '',
                        confidenceLevel: data.confidenceLevel || 'medium',
                        isGroundTruth: data.isGroundTruth ?? true,
                        createdAt: data.createdAt?.toMillis?.() || Date.now()
                    }
                });

                successCount++;
                process.stdout.write(`\r  Processing: ${successCount} documents...`);
            } catch (err) {
                console.error(`\n  ❌ Failed to process ${doc.id}:`, err);
                errorCount++;
            }
        }

        // Upsert batch to Pinecone
        if (vectors.length > 0) {
            await index.namespace(CONFIG.PINECONE_NAMESPACE).upsert(vectors);
        }

        // Rate limiting: 500ms between batches to avoid API limits
        if (i + CONFIG.BATCH_SIZE < docs.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // 4. Summary
    console.log('\n\n[4/4] Migration Complete');
    console.log('==========================================');
    console.log(`✅ Successfully indexed: ${successCount} examples`);
    console.log(`❌ Failed: ${errorCount} examples`);
    console.log(`📁 Pinecone namespace: ${CONFIG.PINECONE_NAMESPACE}`);
    console.log('==========================================\n');
}

// Run migration
migrate().catch(console.error);
