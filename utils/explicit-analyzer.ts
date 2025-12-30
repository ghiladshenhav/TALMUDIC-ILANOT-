/**
 * Explicit Analyzer - Extractive layer for Talmudic references
 * 
 * Prevents AI verbosity with:
 * - 512 token hard limit
 * - Strict schema constraints
 * - Extractive-only prompt
 */

// Define Type enum locally (same as TextAnalyzerView)
enum SchemaType {
    STRING = "STRING",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    ARRAY = "ARRAY",
    OBJECT = "OBJECT"
}
const Type = SchemaType;

export interface ExplicitFinding {
    source: string;
    snippet: string;
    hebrewText?: string;
    title?: string;
    justification?: string;
    pageNumber: number;
    isImplicit: boolean;
}

/**
 * Minimal extractive prompt - forces AI to be concise
 */
export const EXPLICIT_PROMPT = `You are a citation extractor. Extract Talmudic/Midrashic citations.

RULES:
- Extract EXPLICIT citations (e.g., "Bavli Sanhedrin 98a", "תהלים ק״ז")
- Keep ALL fields SHORT - 1-2 sentences MAX per field
- snippet: EXACT text from document (verbatim, no changes)
- hebrewText: ONLY the key phrase, NOT entire page
- justification: 1 sentence explaining why
- If unsure, skip the reference

OUTPUT FORMAT:
{
  "foundReferences": [
    {
      "source": "Bavli Tractate Page",
      "snippet": "exact text from input",
      "hebrewText": "key Hebrew phrase only",
      "title": "short title",
      "justification": "1 sentence why",
      "pageNumber": 1,
      "isImplicit": false
    }
  ]
}

--- TEXT TO ANALYZE ---
`;

/**
 * Schema with essential fields + strict length constraints
 */
export const EXPLICIT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        foundReferences: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    source: { type: Type.STRING, description: "Bavli/Mishnah Tractate Page (e.g. Bavli Berakhot 2a)" },
                    snippet: { type: Type.STRING, description: "EXACT text from input document - verbatim only" },
                    hebrewText: { type: Type.STRING, description: "Key Hebrew phrase ONLY, max 100 chars" },
                    title: { type: Type.STRING, description: "Short title, max 10 words" },
                    justification: { type: Type.STRING, description: "1 sentence MAX" },
                    pageNumber: { type: Type.INTEGER },
                    isImplicit: { type: Type.BOOLEAN }
                },
                required: ["source", "snippet", "pageNumber", "isImplicit"]
            }
        }
    },
    required: ["foundReferences"]
};
