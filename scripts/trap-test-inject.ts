/**
 * Trap Test Script: Injects fake Ground Truth example to test anti-projection guardrails
 * Uses REST API directly (same as the app) to avoid SDK DNS issues
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Firebase config
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: "talmudic-reception-trees.firebaseapp.com",
    projectId: "talmudic-reception-trees",
    storageBucket: "talmudic-reception-trees.firebasestorage.app",
    messagingSenderId: "1081944959110",
    appId: "1:1081944959110:web:a3220fde47189f8e7e4907"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genai = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY!);

const PINECONE_API_KEY = process.env.VITE_PINECONE_API_KEY!;
const PINECONE_INDEX_HOST = 'talmudic-corpus-c2d4nqo.svc.aped-4627-b74a.pinecone.io'; // From existing code

async function generateEmbedding(text: string): Promise<number[]> {
    const model = genai.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function injectTrap() {
    console.log('🪤 TRAP TEST: Injecting fake Ground Truth example...\n');

    const trapExample = {
        userId: 'user-1',
        phrase: 'Apple Pie',
        snippet: 'I ate apple pie for dessert. It was delicious with vanilla ice cream.',
        action: 'APPROVE',
        correctSource: 'Bavli Berakhot 50a',
        correctionReason: '',
        confidenceLevel: 'high',
        isGroundTruth: true,
        createdAt: Timestamp.now()
    };

    // 1. Save to Firestore
    console.log('[1/3] Saving trap to Firestore...');
    const docRef = await addDoc(collection(db, 'ground_truth_examples'), trapExample);
    console.log(`✅ Firestore doc: ${docRef.id}`);

    // 2. Generate embedding
    console.log('[2/3] Generating embedding...');
    const textToEmbed = `${trapExample.phrase} ${trapExample.snippet}`;
    const embedding = await generateEmbedding(textToEmbed);
    console.log(`✅ Embedding generated (${embedding.length} dimensions)`);

    // 3. Upsert to Pinecone via REST API
    console.log('[3/3] Upserting to Pinecone via REST...');
    const upsertResponse = await fetch(`https://${PINECONE_INDEX_HOST}/vectors/upsert`, {
        method: 'POST',
        headers: {
            'Api-Key': PINECONE_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            namespace: 'ground-truth',
            vectors: [{
                id: docRef.id,
                values: embedding,
                metadata: {
                    userId: 'user-1',
                    phrase: trapExample.phrase,
                    snippet: trapExample.snippet,
                    action: 'APPROVE',
                    correctSource: trapExample.correctSource,
                    isGroundTruth: true
                }
            }]
        })
    });

    if (!upsertResponse.ok) {
        throw new Error(`Pinecone upsert failed: ${upsertResponse.status}`);
    }

    console.log('\n🪤 TRAP INJECTED SUCCESSFULLY!');
    console.log('==========================================');
    console.log(`Phrase: "${trapExample.phrase}"`);
    console.log(`Fake Source: ${trapExample.correctSource}`);
    console.log(`Pinecone ID: ${docRef.id}`);
    console.log('==========================================');
    console.log('\nNow analyze a text containing "apple pie" to test guardrails.');
}

injectTrap().catch(console.error);
