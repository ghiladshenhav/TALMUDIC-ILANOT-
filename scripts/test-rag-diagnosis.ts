// Test script to diagnose RAG behavior
// Run with: npx ts-node --esm scripts/test-rag-diagnosis.ts

import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const PINECONE_INDEX_NAME = 'talmudic-corpus';
const EMBEDDING_MODEL = 'text-embedding-004';

async function diagnoseRag() {
    console.log('=== RAG Diagnosis ===\n');

    // Test phrase - the one that keeps hallucinating
    const testPhrase = 'עמא פזיזא';
    console.log(`Test phrase: "${testPhrase}"`);
    console.log('Expected source: Bavli Beitzah 25b\n');

    // 1. Check environment variables
    console.log('1. ENVIRONMENT CHECK:');
    console.log(`   VITE_PINECONE_API_KEY: ${process.env.VITE_PINECONE_API_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`   VITE_GEMINI_API_KEY: ${process.env.VITE_GEMINI_API_KEY ? '✓ Set' : '✗ Missing'}\n`);

    if (!process.env.VITE_PINECONE_API_KEY || !process.env.VITE_GEMINI_API_KEY) {
        console.error('Missing API keys. Cannot continue.');
        return;
    }

    // 2. Check Pinecone index stats
    console.log('2. PINECONE INDEX STATS:');
    const pinecone = new Pinecone({ apiKey: process.env.VITE_PINECONE_API_KEY });
    const index = pinecone.index(PINECONE_INDEX_NAME);

    try {
        const stats = await index.describeIndexStats();
        console.log(`   Total vectors: ${stats.totalRecordCount}`);
        console.log(`   Namespaces: ${JSON.stringify(stats.namespaces)}\n`);
    } catch (err) {
        console.error('   Failed to get index stats:', err);
        return;
    }

    // 3. Generate embedding for test phrase
    console.log('3. EMBEDDING GENERATION:');
    const genai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
    let embedding: number[];
    try {
        const result = await genai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: testPhrase
        });
        embedding = result.embeddings?.[0]?.values || [];
        console.log(`   Embedding dimension: ${embedding.length}`);
        console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);
    } catch (err) {
        console.error('   Failed to generate embedding:', err);
        return;
    }

    // 4. Query Pinecone with the embedding
    console.log('4. PINECONE QUERY RESULTS (top 10):');
    try {
        const queryResult = await index.query({
            vector: embedding,
            topK: 10,
            includeMetadata: true
        });

        if (!queryResult.matches?.length) {
            console.log('   ❌ NO RESULTS FOUND! The index may be empty or embedding mismatch.');
        } else {
            queryResult.matches.forEach((match, i) => {
                const ref = match.metadata?.ref as string || 'Unknown';
                const score = match.score?.toFixed(4) || 'N/A';
                const hebrewSnippet = (match.metadata?.he as string || '').substring(0, 80);
                console.log(`   ${i + 1}. ${ref} (score: ${score})`);
                console.log(`      "${hebrewSnippet}..."`);

                // Check if this is the expected source
                if (ref.toLowerCase().includes('beitzah') && ref.includes('25')) {
                    console.log('      ✓ THIS IS THE EXPECTED SOURCE!');
                }
            });
        }
    } catch (err) {
        console.error('   Failed to query Pinecone:', err);
    }

    // 5. Directly fetch Beitzah 25b from Sefaria to check if phrase exists
    console.log('\n5. VERIFYING PHRASE EXISTS IN BEITZAH 25B:');
    try {
        const response = await fetch('https://www.sefaria.org/api/texts/Beitzah.25b?context=0&pad=0');
        const data = await response.json();

        const hebrewText = Array.isArray(data.he) ? data.he.join(' ') : data.he;
        const containsPhrase = hebrewText.includes('פזיזא');

        console.log(`   Fetched Beitzah 25b successfully`);
        console.log(`   Contains "פזיזא": ${containsPhrase ? '✓ YES' : '✗ NO'}`);

        if (containsPhrase) {
            // Find the sentence containing the phrase
            const sentences = hebrewText.split('.');
            const matchingSentence = sentences.find((s: string) => s.includes('פזיזא'));
            if (matchingSentence) {
                console.log(`   Context: "...${matchingSentence.trim().substring(0, 100)}..."`);
            }
        }
    } catch (err) {
        console.error('   Failed to fetch from Sefaria:', err);
    }

    console.log('\n=== Diagnosis Complete ===');
}

diagnoseRag().catch(console.error);
