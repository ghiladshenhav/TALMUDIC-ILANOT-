/**
 * Local Dicta LM-3 Integration via Ollama
 * 
 * Provides FREE text analysis using local Dicta 1.7B model.
 * Requires Ollama to be installed and running locally.
 * 
 * Setup:
 *   brew install ollama
 *   ollama serve
 *   ollama pull dicta-il/DictaLM-3.0-1.7B-Thinking-GGUF
 */

// Ollama API endpoint (local)
const OLLAMA_API_URL = 'http://localhost:11434';

// Fallback chain for Dicta models: 24B (Best Reasoning) -> 12B -> 2.0 (Legacy) -> 3.0 (1.7B)
const DICTA_MODEL_PREFERENCES = ['dicta-lm-24b', 'dicta-lm-12b', 'dicta-lm-2', 'dicta-lm-3'];

/**
 * Check if Ollama is running and Dicta model is available
 */
export async function isDictaAvailable(): Promise<{ available: boolean; model?: string; error?: string }> {
    try {
        // First check if Ollama is running
        const tagsResponse = await fetch(`${OLLAMA_API_URL}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000) // 2 second timeout
        });

        if (!tagsResponse.ok) {
            return { available: false, error: 'Ollama server not responding' };
        }

        const data = await tagsResponse.json();
        const models = data.models || [];

        // Find the first matching model from our preference list
        for (const pref of DICTA_MODEL_PREFERENCES) {
            const found = models.find((m: any) => m.name.toLowerCase().includes(pref));
            if (found) {
                console.log(`[Dicta] Found preferred model: ${found.name}`);
                return { available: true, model: found.name };
            }
        }

        // Fallback: check for any model with 'dicta' in name
        const anyDicta = models.find((m: any) =>
            m.name.toLowerCase().includes('dicta') ||
            m.name.toLowerCase().includes('dictalm')
        );

        if (anyDicta) {
            console.log(`[Dicta] Found fallback model: ${anyDicta.name}`);
            return { available: true, model: anyDicta.name };
        }

        // No Dicta model found
        return {
            available: false,
            error: 'Dicta model not installed. Run: ollama pull dicta-lm-3'
        };

    } catch (error: any) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            return { available: false, error: 'Ollama not running. Start with: ollama serve' };
        }
        return { available: false, error: `Connection failed: ${error.message}` };
    }
}

/**
 * Generate content using local Dicta model via Ollama
 * 
 * @param prompt - The full prompt to send
 * @param model - Model name (auto-detected if not provided)
 * @returns Generated text response
 */
export async function generateWithDicta(
    prompt: string,
    model?: string
): Promise<string> {
    // Auto-detect model if not provided
    if (!model) {
        const status = await isDictaAvailable();
        if (!status.available) {
            throw new Error(status.error || 'Dicta not available');
        }
        model = status.model!;
    }

    console.log(`[Dicta] Generating with model: ${model}`);

    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.1,  // Low for consistent structured output
                num_predict: 8192, // Max tokens to generate
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dicta API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.response || '';
}

/**
 * Generate using Ollama's chat API with proper message roles
 * This is the recommended method for instruction-tuned models like Dicta
 */
export async function chatWithDicta(
    systemPrompt: string,
    userMessage: string,
    model?: string
): Promise<string> {
    // Auto-detect model if not provided
    if (!model) {
        const status = await isDictaAvailable();
        if (!status.available) {
            throw new Error(status.error || 'Dicta not available');
        }
        model = status.model!;
    }

    console.log(`[Dicta] Chat API with model: ${model}`);

    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            stream: false,
            options: {
                temperature: 0.1,
                num_predict: 8192,
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dicta chat API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.message?.content || '';
}

/**
 * Analyze text for Talmudic references using local Dicta model.
 * This is the main function that replaces Gemini for text analysis.
 * 
 * @param text - Hebrew/German text to analyze
 * @param systemPrompt - The analysis prompt (BASE_PROMPT from text-analysis.ts)
 * @returns Raw response (JSON string expected)
 */
export async function analyzeTextWithDicta(
    text: string,
    systemPrompt: string
): Promise<string> {
    // HEBREW PROMPT - The 1.7B model works best in its native language
    // We ask for JSON keys in English for compatibility, but instructions in Hebrew
    const hebrewSystemPrompt = `אתה עוזר מחקרי שמזהה ציטוטים מהתלמוד הבבלי, הירושלמי, והמדרש בטקסטים עבריים.
המשימה שלך: אנח את הטקסט ומצא בו ציטוטים או אזכורים למקורות חז"ל.

עליך להחזיר אובייקט JSON בלבד. אין לכתוב טקסט נוסף לפני או אחרי ה-JSON.

דוגמה לפלט רצוי:
{
  "foundReferences": [
    {
      "source": "Bavli Sanhedrin 37a",
      "snippet": "כל המקיים נפש אחת מישראל",
      "justification": "ציטוט ישיר מהמשנה",
      "title": "הצלת נפשות",
      "hebrewText": "כל המקיים נפש אחת מישראל כאילו קיים עולם מלא",
      "translation": "Whoever saves a life...",
      "isImplicit": false,
      "pageNumber": 1
    }
  ]
}

אם לא נמצאו ציטוטים, החזר:
{"foundReferences": []}

הקפד על JSON תקין. אל תשתמש ב-Markdown.`;

    const userMessage = `נתח את הטקסט הבא ומצא בו מקורות:\n\n${text}`;

    console.log('[Dicta] Using HEBREW prompt +', text.length, 'char text');
    const rawResponse = await chatWithDicta(hebrewSystemPrompt, userMessage);
    console.log('[Dicta] Raw response length:', rawResponse.length);
    console.log('[Dicta] Raw response preview:', rawResponse.substring(0, 500));

    // Strip <think>...</think> blocks from "Thinking" model variants
    let cleanedResponse = rawResponse;
    if (cleanedResponse.includes('<think>')) {
        const thinkEnd = cleanedResponse.lastIndexOf('</think>');
        if (thinkEnd !== -1) {
            cleanedResponse = cleanedResponse.substring(thinkEnd + 8).trim();
            console.log('[Dicta] Stripped thinking block, remaining:', cleanedResponse.substring(0, 200));
        }
    }

    // If response doesn't start with {, try to find JSON in it
    if (!cleanedResponse.trim().startsWith('{')) {
        const jsonStart = cleanedResponse.indexOf('{');
        if (jsonStart !== -1) {
            cleanedResponse = cleanedResponse.substring(jsonStart);
        } else {
            console.warn('[Dicta] No JSON found in response, returning empty');
            return '{"foundReferences": []}';
        }
    }

    // Try to repair common JSON errors
    let repairedJson = cleanedResponse;

    // Fix: <translation" -> "translation":
    repairedJson = repairedJson.replace(/<(\w+)"/g, '"$1":');

    // Fix: missing quotes around keys
    repairedJson = repairedJson.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

    // Fix: trailing commas before } or ]
    repairedJson = repairedJson.replace(/,\s*([}\]])/g, '$1');

    // Fix: newlines inside strings (replace with space)
    repairedJson = repairedJson.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
        return match.replace(/\n/g, ' ');
    });

    // Find the first complete JSON object using balanced braces
    const jsonStart = repairedJson.indexOf('{');
    if (jsonStart === -1) {
        console.warn('[Dicta] No JSON object found after repair');
        return '{"foundReferences": []}';
    }

    let braceCount = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < repairedJson.length; i++) {
        if (repairedJson[i] === '{') braceCount++;
        if (repairedJson[i] === '}') braceCount--;
        if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
        }
    }

    if (jsonEnd === -1) {
        // Try to close incomplete JSON
        repairedJson = repairedJson.substring(jsonStart) + ']}';
        jsonEnd = repairedJson.length;
    }

    const extractedJson = repairedJson.substring(jsonStart, jsonEnd);
    console.log('[Dicta] Extracted JSON (repaired):', extractedJson.substring(0, 400));

    // Validate and return
    try {
        const parsed = JSON.parse(extractedJson);
        // Ensure foundReferences exists
        if (!parsed.foundReferences) {
            parsed.foundReferences = [];
        }
        return JSON.stringify(parsed);
    } catch (e) {
        console.warn('[Dicta] JSON parse failed after repair:', (e as Error).message);
        console.warn('[Dicta] Attempted JSON:', extractedJson.substring(0, 500));
        return '{"foundReferences": []}';
    }
}

/**
 * Stream generation for real-time progress (if needed later)
 */
export async function* streamWithDicta(
    prompt: string,
    model?: string
): AsyncGenerator<string, void, unknown> {
    if (!model) {
        const status = await isDictaAvailable();
        if (!status.available) {
            throw new Error(status.error || 'Dicta not available');
        }
        model = status.model!;
    }

    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: true,
            options: {
                temperature: 0.1,
                num_predict: 8192,
            }
        })
    });

    if (!response.ok || !response.body) {
        throw new Error(`Dicta stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.response) {
                    yield data.response;
                }
            } catch {
                // Ignore parse errors for incomplete chunks
            }
        }
    }
}

/**
 * Provider type for analysis
 */
export type AnalysisProvider = 'gemini' | 'dicta';

/**
 * Get display info for the analysis provider
 */
export function getProviderInfo(provider: AnalysisProvider): { name: string; cost: string; quality: string } {
    if (provider === 'dicta') {
        return {
            name: 'Dicta LM-3 (Local)',
            cost: 'FREE',
            quality: 'Good for Hebrew'
        };
    }
    return {
        name: 'Gemini 2.5 Flash',
        cost: 'Paid (API)',
        quality: 'Excellent'
    };
}
