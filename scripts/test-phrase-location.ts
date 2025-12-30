import * as fs from 'fs';
import * as path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from .env.local manually
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
for (const line of envFile.split('\n')) {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim();
}

async function main() {
    const pinecone = new Pinecone({ apiKey: process.env.VITE_PINECONE_API_KEY! });
    const index = pinecone.index('talmudic-corpus');
    const genai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });
    
    // Generate embedding for the phrase
    const embedding = await genai.models.embedContent({
        model: 'text-embedding-004',
        contents: 'עמא פזיזא',
    });
    const vector = embedding.embeddings?.[0]?.values || [];
    
    console.log('Checking default namespace (page-level)...');
    
    // Query default namespace
    const defaultResults = await index.query({
        vector: vector,
        topK: 10,
        includeMetadata: true
    });
    
    console.log('\nDefault namespace results:');
    for (const match of defaultResults.matches || []) {
        const meta = match.metadata as any;
        console.log(`  ${meta?.ref || match.id} (score: ${match.score?.toFixed(4)})`);
        if (meta?.he) {
            const text = meta.he.substring(0, 100);
            const hasPhrase = meta.he.includes('פזיזא');
            console.log(`    ${hasPhrase ? '✓ HAS פזיזא' : ''} ${text}...`);
        }
    }
    
    // Also check Shabbat 88a directly from Sefaria
    console.log('\n\nFetching Shabbat 88a from Sefaria...');
    const response = await fetch('https://www.sefaria.org/api/texts/Shabbat.88a?context=0');
    const data = await response.json();
    
    if (data.he) {
        const text = Array.isArray(data.he) ? data.he.join(' ') : data.he;
        const hasPhrase = text.includes('פזיזא');
        console.log(`Shabbat 88a contains "פזיזא": ${hasPhrase ? '✓ YES' : '✗ NO'}`);
        if (hasPhrase) {
            const idx = text.indexOf('פזיזא');
            console.log(`Context: ...${text.substring(Math.max(0, idx - 50), idx + 50)}...`);
        }
    }
}

main().catch(console.error);
