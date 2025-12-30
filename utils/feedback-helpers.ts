import { db } from '../firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, Timestamp, where } from 'firebase/firestore';
import { AIFinding } from '../types';

export interface FeedbackItem {
    type: 'positive' | 'negative';
    snippet: string;
    source: string;
    justification: string;
    timestamp: Timestamp;
}

export interface TrainingExample {
    text: string;
    source: string;
    isPositive: boolean;
    explanation?: string;        // User's reasoning for why this is a valid reference
    sourceDocumentId?: string;   // Links to the library text this came from
    matchingPhrase?: string;     // The exact phrase that matches
    timestamp: Timestamp;
}

const COLLECTION_NAME = 'ai_feedback';
const TRAINING_COLLECTION = 'ai_training_examples';

export const saveNegativeFeedback = async (finding: AIFinding) => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            type: 'negative',
            snippet: finding.snippet,
            source: finding.source,
            justification: finding.justification || 'User rejected this finding.',
            timestamp: Timestamp.now()
        });
        console.log('Saved negative feedback example.');
    } catch (e) {
        console.error('Failed to save negative feedback:', e);
    }
};

export const savePositiveFeedback = async (finding: AIFinding) => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            type: 'positive',
            snippet: finding.snippet,
            source: finding.source,
            justification: finding.justification || 'User manually added this finding.',
            timestamp: Timestamp.now()
        });
        console.log('Saved positive feedback example.');
    } catch (e) {
        console.error('Failed to save positive feedback:', e);
    }
};

/**
 * Save a training example to the ai_training_examples collection
 * Used for explicit thumbs up/down feedback on AI findings
 * Enhanced to include user explanations for ground truth training
 */
export const saveTrainingExample = async (finding: AIFinding, isPositive: boolean) => {
    try {
        await addDoc(collection(db, TRAINING_COLLECTION), {
            text: finding.snippet,
            source: finding.source,
            isPositive: isPositive,
            explanation: finding.userExplanation || undefined,
            sourceDocumentId: finding.sourceDocumentId || undefined,
            matchingPhrase: finding.matchingPhrase || undefined,
            isGroundTruth: finding.isGroundTruth || false,
            addedManually: finding.addedManually || false,
            timestamp: Timestamp.now()
        });
        console.log(`Saved training example (${isPositive ? 'positive' : 'negative'}) to ${TRAINING_COLLECTION}${finding.userExplanation ? ' with explanation' : ''}`);
        return true;
    } catch (e) {
        console.error('Failed to save training example:', e);
        return false;
    }
};

/**
 * Structured correction data for enhanced training
 */
export interface StructuredCorrectionData {
    errorType: string;
    originalSource: string;
    correctedSource: string;
    explanation: string;
    snippet: string;
}

/**
 * Save a structured correction with error type categorization
 * This provides richer training data for the AI
 */
export const saveStructuredCorrection = async (correction: StructuredCorrectionData): Promise<boolean> => {
    try {
        await addDoc(collection(db, TRAINING_COLLECTION), {
            text: correction.snippet,
            source: correction.correctedSource || correction.originalSource,
            originalSource: correction.originalSource,
            correctedSource: correction.correctedSource,
            errorType: correction.errorType,
            explanation: correction.explanation,
            isPositive: correction.errorType === 'approved',
            isCorrection: !!correction.correctedSource,
            isStructured: true,
            timestamp: Timestamp.now()
        });

        console.log(`%c[Training] 🟡 Saved CORRECTION: ${correction.errorType} | ${correction.originalSource} → ${correction.correctedSource || 'rejected'}`, 'color: #eab308');
        return true;
    } catch (e) {
        console.error('[Training] Failed to save structured correction:', e);
        return false;
    }
};

/**
 * Training examples result for visibility/debugging
 */
export interface TrainingExamplesResult {
    promptText: string;
    approvedCount: number;
    rejectedCount: number;
}

/**
 * Get training examples (both approved and rejected) for few-shot learning.
 * Returns formatted prompt text AND counts for visibility.
 */
export const getTrainingExamplesForPrompt = async (maxItems: number = 20): Promise<TrainingExamplesResult> => {
    try {
        let approvedDocs: any[] = [];
        let rejectedDocs: any[] = [];

        // Try indexed query first, fall back to fetch-all if index doesn't exist
        try {
            // Fetch approved examples
            const approvedQuery = query(
                collection(db, TRAINING_COLLECTION),
                where('isPositive', '==', true),
                orderBy('timestamp', 'desc'),
                limit(Math.floor(maxItems / 2))
            );
            const approvedSnapshot = await getDocs(approvedQuery);
            approvedSnapshot.forEach(doc => approvedDocs.push(doc.data()));

            // Fetch rejected examples
            const rejectedQuery = query(
                collection(db, TRAINING_COLLECTION),
                where('isPositive', '==', false),
                orderBy('timestamp', 'desc'),
                limit(Math.floor(maxItems / 2))
            );
            const rejectedSnapshot = await getDocs(rejectedQuery);
            rejectedSnapshot.forEach(doc => rejectedDocs.push(doc.data()));
        } catch (indexErr: any) {
            // Fallback: fetch all docs and filter/sort in memory (slower but works without index)
            if (indexErr.message?.includes('index')) {
                console.warn('[Training] Index not found, using in-memory fallback. Consider creating the index for better performance.');
                const allQuery = query(collection(db, TRAINING_COLLECTION), limit(maxItems * 2));
                const allSnapshot = await getDocs(allQuery);

                const allDocs: any[] = [];
                allSnapshot.forEach(doc => allDocs.push(doc.data()));

                // Sort by timestamp (most recent first) and split by isPositive
                allDocs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                approvedDocs = allDocs.filter(d => d.isPositive === true).slice(0, Math.floor(maxItems / 2));
                rejectedDocs = allDocs.filter(d => d.isPositive === false).slice(0, Math.floor(maxItems / 2));
            } else {
                throw indexErr;
            }
        }

        const approvedCount = approvedDocs.length;
        const rejectedCount = rejectedDocs.length;

        if (approvedCount === 0 && rejectedCount === 0) {
            console.log('[Training] No training examples found');
            return { promptText: "", approvedCount: 0, rejectedCount: 0 };
        }

        let promptText = "\n\n--- USER TRAINING DATA (GROUND TRUTH) ---\n";
        promptText += `[Using ${approvedCount} approved, ${rejectedCount} rejected examples]\n\n`;

        // Add approved patterns
        if (approvedCount > 0) {
            promptText += "## ✅ VERIFIED REFERENCES (Find patterns like these):\n";
            approvedDocs.forEach(data => {
                promptText += `• "${data.text}" → ${data.source}`;
                if (data.explanation) {
                    promptText += ` | Reason: ${data.explanation}`;
                }
                promptText += '\n';
            });
            promptText += '\n';
        }

        // Add rejected patterns grouped by error type for nuanced AI learning
        if (rejectedCount > 0) {
            // Group corrections by error type
            const hallucinations: any[] = [];
            const structural: any[] = [];
            const wrongPage: any[] = [];
            const wrongSource: any[] = [];
            const notRelevant: any[] = [];
            const other: any[] = [];

            rejectedDocs.forEach(data => {
                const errorType = data.errorType || 'other';

                switch (errorType) {
                    case 'hallucination': hallucinations.push(data); break;
                    case 'structural': structural.push(data); break;
                    case 'wrong_page': wrongPage.push(data); break;
                    case 'wrong_source': wrongSource.push(data); break;
                    case 'not_relevant': notRelevant.push(data); break;
                    default: other.push(data);
                }
            });

            promptText += "## ⚠️ KNOWN PITFALLS (Avoid these specific mistakes):\n\n";

            // HALLUCINATIONS - Most severe, AI was completely wrong
            if (hallucinations.length > 0) {
                promptText += "### 🔴 HALLUCINATIONS (These are NOT real citations - NEVER suggest):\n";
                hallucinations.forEach(data => {
                    promptText += `• "${data.text}" was incorrectly cited as ${data.source || data.originalSource || 'a reference'}`;
                    if (data.explanation) promptText += ` (Reason: ${data.explanation})`;
                    promptText += '\n';
                });
                promptText += '\n';
            }

            // STRUCTURAL - Common false positive, teach AI to ignore these patterns
            if (structural.length > 0) {
                promptText += "### 🟠 STRUCTURAL FALSE POSITIVES (Discourse markers, NOT citations):\n";
                structural.forEach(data => {
                    promptText += `• "${data.text}" is a structural phrase, NOT a thematic citation`;
                    if (data.explanation) promptText += ` (${data.explanation})`;
                    promptText += '\n';
                });
                promptText += '\n';
            }

            // WRONG PAGE - AI was close, just got the page wrong
            if (wrongPage.length > 0) {
                promptText += "### 🟡 PAGE CORRECTIONS (You were close - right tractate, wrong page):\n";
                wrongPage.forEach(data => {
                    promptText += `• For "${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}"`;
                    if (data.originalSource && data.correctedSource) {
                        promptText += ` → Correct: ${data.correctedSource}, NOT ${data.originalSource}`;
                    }
                    if (data.explanation) promptText += ` (${data.explanation})`;
                    promptText += '\n';
                });
                promptText += '\n';
            }

            // WRONG SOURCE - AI identified the wrong tractate/book entirely
            if (wrongSource.length > 0) {
                promptText += "### 🟡 SOURCE CORRECTIONS (Wrong tractate or book):\n";
                wrongSource.forEach(data => {
                    promptText += `• For "${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}"`;
                    if (data.originalSource && data.correctedSource) {
                        promptText += ` → Correct: ${data.correctedSource}, NOT ${data.originalSource}`;
                    }
                    if (data.explanation) promptText += ` (${data.explanation})`;
                    promptText += '\n';
                });
                promptText += '\n';
            }

            // NOT RELEVANT - Real reference but not what author intended
            if (notRelevant.length > 0) {
                promptText += "### 🔵 NOT RELEVANT (Real citation but not author's intent):\n";
                notRelevant.forEach(data => {
                    promptText += `• "${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}"`;
                    if (data.source) promptText += ` - suggested as ${data.source} but not intentional`;
                    if (data.explanation) promptText += ` (${data.explanation})`;
                    promptText += '\n';
                });
                promptText += '\n';
            }

            // OTHER - Miscellaneous corrections
            if (other.length > 0) {
                promptText += "### ⚪ OTHER CORRECTIONS:\n";
                other.forEach(data => {
                    promptText += `• "${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}"`;
                    if (data.source) promptText += ` (wrongly suggested: ${data.source})`;
                    if (data.explanation) promptText += ` - ${data.explanation}`;
                    promptText += '\n';
                });
                promptText += '\n';
            }
        }

        promptText += "--- END TRAINING DATA ---\n";

        console.log(`[Training] Loaded ${approvedCount} approved, ${rejectedCount} rejected examples`);
        return { promptText, approvedCount, rejectedCount };

    } catch (e) {
        console.error("[Training] Failed to fetch examples:", e);
        return { promptText: "", approvedCount: 0, rejectedCount: 0 };
    }
};

/**
 * @deprecated Use getTrainingExamplesForPrompt instead
 */
export const getPositiveTrainingExamples = async (maxItems: number = 20): Promise<string> => {
    const result = await getTrainingExamplesForPrompt(maxItems);
    return result.promptText;
};

export const getFeedbackExamples = async (maxItems: number = 5): Promise<string> => {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('timestamp', 'desc'), limit(maxItems));
        const snapshot = await getDocs(q);

        if (snapshot.empty) return "";

        const negatives: FeedbackItem[] = [];
        const positives: FeedbackItem[] = [];

        snapshot.forEach(doc => {
            const data = doc.data() as FeedbackItem;
            if (data.type === 'negative') negatives.push(data);
            else positives.push(data);
        });

        let promptText = "\n\n*** USER FEEDBACK EXAMPLES (LEARNING FROM CORRECTIONS) ***\n";

        if (negatives.length > 0) {
            promptText += "AVOID patterns similar to these REJECTED findings:\n";
            negatives.forEach(item => {
                promptText += `- REJECTED: "${item.snippet}" (Claimed source: ${item.source})\n`;
            });
        }

        if (positives.length > 0) {
            promptText += "\nLOOK FOR patterns similar to these MANUALLY ADDED findings:\n";
            positives.forEach(item => {
                promptText += `- ADDED: "${item.snippet}" (Real source: ${item.source}). Reason: ${item.justification}\n`;
            });
        }

        return promptText;
    } catch (e) {
        console.error("Failed to fetch feedback examples:", e);
        return "";
    }
};
