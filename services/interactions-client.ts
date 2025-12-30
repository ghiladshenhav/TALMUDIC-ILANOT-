/**
 * Interactions API Client
 * 
 * Wraps Google's Interactions API for server-side state management.
 * This replaces manual chat history management with server-managed sessions.
 * 
 * Benefits:
 * - Server-side state (no client history management)
 * - Cache hits on repeated context (reduced costs)
 * - Background execution for long-running tasks
 * - Deep Research agent support
 */

import { GoogleGenAI } from '@google/genai';

// Types
export interface InteractionSession {
    id: string;
    model: string;
    systemInstruction?: string;
    lastInteractionId: string | null;
    createdAt: Date;
}

export interface InteractionResult {
    id: string;
    text: string;
    status: 'completed' | 'running' | 'failed' | 'cancelled';
}

export interface DeepResearchResult extends InteractionResult {
    outputs: Array<{ text: string }>;
}

// Lazy initialization
let genaiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
    if (!genaiClient) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('VITE_GEMINI_API_KEY is required');
        }
        genaiClient = new GoogleGenAI({ apiKey });
    }
    return genaiClient;
}

/**
 * Helper to extract text from interaction output content
 * The output can be various content types (text, image, etc.)
 */
function extractTextFromOutput(output: any): string {
    if (!output) return '';
    // Check if it has a text property directly
    if (typeof output.text === 'string') return output.text;
    // Check if it's content with parts
    if (output.parts && Array.isArray(output.parts)) {
        return output.parts
            .filter((part: any) => typeof part.text === 'string')
            .map((part: any) => part.text)
            .join('');
    }
    return '';
}

// Session storage (in-memory, could be persisted to localStorage/Firebase)
const sessions: Map<string, InteractionSession> = new Map();

/**
 * Create a new interaction session
 */
export function createSession(
    sessionId: string,
    options: {
        model?: string;
        systemInstruction?: string;
    } = {}
): InteractionSession {
    const session: InteractionSession = {
        id: sessionId,
        model: options.model || 'gemini-2.5-flash',
        systemInstruction: options.systemInstruction,
        lastInteractionId: null,
        createdAt: new Date()
    };
    sessions.set(sessionId, session);
    console.log(`[Interactions] Created session: ${sessionId}`);
    return session;
}

/**
 * Get an existing session
 */
export function getSession(sessionId: string): InteractionSession | undefined {
    return sessions.get(sessionId);
}

/**
 * Send a message using the Interactions API with server-side state
 */
export async function sendMessage(
    sessionId: string,
    message: string,
    context?: string
): Promise<InteractionResult> {
    const client = getClient();
    let session = sessions.get(sessionId);

    // Auto-create session if it doesn't exist
    if (!session) {
        session = createSession(sessionId);
    }

    // Build input with optional context
    const input = context ? `${context}\n\n${message}` : message;

    try {
        // Create interaction with stateful conversation
        const interaction = await client.interactions.create({
            model: session.model,
            input,
            ...(session.lastInteractionId && {
                previous_interaction_id: session.lastInteractionId
            }),
            ...(session.systemInstruction && {
                config: {
                    systemInstruction: session.systemInstruction
                }
            })
        });

        // Update session with new interaction ID
        session.lastInteractionId = interaction.id;
        sessions.set(sessionId, session);

        // Extract response text
        const outputs = interaction.outputs || [];
        const lastOutput = outputs[outputs.length - 1];
        const text = extractTextFromOutput(lastOutput);

        console.log(`[Interactions] Message sent in session ${sessionId}, interaction: ${interaction.id}`);

        return {
            id: interaction.id,
            text,
            status: (interaction as any).status || 'completed'
        };
    } catch (error) {
        console.error('[Interactions] Error sending message:', error);
        throw error;
    }
}

/**
 * Start a Deep Research task
 */
export async function startDeepResearch(
    query: string
): Promise<{ interactionId: string }> {
    const client = getClient();

    try {
        const interaction = await client.interactions.create({
            input: query,
            agent: 'deep-research-pro-preview-12-2025',
            background: true
        });

        console.log(`[Deep Research] Started: ${interaction.id}`);
        return { interactionId: interaction.id };
    } catch (error) {
        console.error('[Deep Research] Failed to start:', error);
        throw error;
    }
}

/**
 * Poll for Deep Research completion
 */
export async function getDeepResearchStatus(
    interactionId: string
): Promise<DeepResearchResult> {
    const client = getClient();

    try {
        const interaction = await client.interactions.get(interactionId);
        const outputs = interaction.outputs || [];
        const lastOutput = outputs[outputs.length - 1];

        return {
            id: interaction.id,
            text: extractTextFromOutput(lastOutput),
            status: (interaction as any).status || 'running',
            outputs: outputs.map((o: any) => ({ text: extractTextFromOutput(o) }))
        };
    } catch (error) {
        console.error('[Deep Research] Failed to get status:', error);
        throw error;
    }
}

/**
 * Wait for Deep Research to complete with polling
 */
export async function waitForDeepResearch(
    interactionId: string,
    onProgress?: (status: string) => void,
    pollIntervalMs: number = 10000,
    maxWaitMs: number = 300000 // 5 minutes
): Promise<DeepResearchResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const result = await getDeepResearchStatus(interactionId);

        if (onProgress) {
            onProgress(result.status);
        }

        if (result.status === 'completed') {
            console.log(`[Deep Research] Completed: ${interactionId}`);
            return result;
        }

        if (result.status === 'failed' || result.status === 'cancelled') {
            throw new Error(`Deep Research ${result.status}`);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Deep Research timed out');
}

/**
 * Clear a session (reset conversation)
 */
export function clearSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
        session.lastInteractionId = null;
        sessions.set(sessionId, session);
        console.log(`[Interactions] Cleared session: ${sessionId}`);
    }
}

/**
 * Delete a session entirely
 */
export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
    console.log(`[Interactions] Deleted session: ${sessionId}`);
}

/**
 * Check if Interactions API is available
 */
export function isInteractionsAvailable(): boolean {
    try {
        const client = getClient();
        return !!(client as any).interactions;
    } catch {
        return false;
    }
}
