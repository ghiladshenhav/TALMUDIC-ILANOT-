
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env specific to the project root
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const PINECONE_INDEX_NAME = 'talmudic-corpus';
const EMBEDDING_MODEL = 'text-embedding-004';

async function testSentenceRetrieval() {
    console.log('=== Sentence-Level RAG Test ===\n');

    const testPhrase = 'עמא פזיזא';
    console.log(`Test phrase: "${testPhrase}"`);
    console.log('Target source: Ketubot 112a\n');

    if (!process.env.VITE_PINECONE_API_KEY || !process.env.VITE_GEMINI_API_KEY) {
        console.error('Missing API keys.');
        return;
    }

    // 1. Generate embedding
    const genai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
    const result = await genai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: testPhrase
    });
    const embedding = result.embeddings?.[0]?.values || [];

    // 2. Query Pinecone 'sentences' namespace
    const pinecone = new Pinecone({ apiKey: process.env.VITE_PINECONE_API_KEY });
    const index = pinecone.index(PINECONE_INDEX_NAME);

    console.log('Querying "sentences" namespace...');
    const queryResult = await index.namespace('sentences').query({
        vector: embedding,
        topK: 5,
        includeMetadata: true
    });

    if (!queryResult.matches?.length) {
        console.log('❌ NO RESULTS FOUND in sentences namespace.');
    } else {
        console.log('\nResults:');
        queryResult.matches.forEach((match, i) => {
            const ref = match.metadata?.ref as string;
            const score = match.score?.toFixed(4);
            const hebrewText = match.metadata?.he as string;
            const isTarget = ref?.includes('Ketubot 112a');

            console.log(`${i + 1}. ${ref} (score: ${score}) ${isTarget ? '✅ TARGET MATCH' : ''}`);
            console.log(`   "${hebrewText}"\n`);
        });
    }


    // 4. Search Sefaria directly to find the correct source
    console.log('\nCannot find "פזיזא" in expected sources. Searching Sefaria Index...');

    async function searchSefaria(query: string) {
        try {
            const response = await fetch('https://www.sefaria.org/api/search-wrapper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    type: "text",
                    source_proj: true,
                    size: 5,
                    filters: ["Talmud"],
                })
            });

            const data = await response.json();
            if (data.hits?.hits?.length) {
                console.log(`Found ${data.hits.hits.length} hits for "${query}":`);
                data.hits.hits.forEach((hit: any) => {
                    console.log(`- ${hit._source.ref}: "${hit._source.he}"`);
                });
            } else {
                console.log(`No results found for "${query}"`);
            }
        } catch (e) {
            console.error('Search failed:', e);
        }
    }

    await searchSefaria('פזיזא');

    // 3. Fetch actual text from Sefaria to verify sources (Original code continues below)
    const sourcesToCheck = ['Shabbat.88a', 'Beitzah.25b'];

    for (const source of sourcesToCheck) {
        console.log(`\nFetching ${source} from Sefaria...`);
        try {
            const response = await fetch(`https://www.sefaria.org/api/texts/${source}?context=0&pad=0`);
            const data = await response.json();
            const hebrewText = Array.isArray(data.he) ? data.he.join(' ') : data.he;
            // Strip vowels (nikkud) for comparison
            const unvocalizedText = hebrewText.replace(/[\u0591-\u05C7]/g, '');

            console.log(`\nSefaria Text Length: ${hebrewText.length} chars`);
            if (unvocalizedText.includes('פזיזא')) {
                console.log(`✅ "פזיזא" FOUND in Sefaria text for ${source}!`);
                // Show context
                const index = unvocalizedText.indexOf('פזיזא');
                const context = unvocalizedText.substring(Math.max(0, index - 50), Math.min(unvocalizedText.length, index + 50));
                console.log(`Context: "...${context}..."`);
            } else {
                console.log(`❌ "פזיזא" NOT FOUND in Sefaria text (${source})`);
            }
        } catch (e) {
            console.error(`Failed to fetch ${source} from Sefaria:`, e);
        }
    }
}

testSentenceRetrieval().catch(console.error);

