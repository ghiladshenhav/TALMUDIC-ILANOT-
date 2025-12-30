import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { GroundTruthExample, GroundTruthAction, GroundTruthCategory } from '../types';
import { upsertGroundTruthToPinecone } from './rag-search';

/**
 * Save a new ground truth example to Firestore AND index to Pinecone for semantic retrieval.
 */
export async function saveGroundTruthExample(
    userId: string,
    phrase: string,
    snippet: string,
    action: GroundTruthAction,
    correctSource: string,
    options: {
        originalSource?: string;
        correctionReason?: string;
        confidenceLevel?: 'high' | 'medium' | 'low';
        category?: GroundTruthCategory;
        justification?: string;
        correctedOcrText?: string;
        isGroundTruth?: boolean;
        errorType?: string;
    } = {}
): Promise<string> {
    // Build the example object, excluding undefined fields (Firestore rejects undefined)
    const example: Record<string, any> = {
        userId,
        createdAt: Timestamp.now(),
        phrase,
        snippet,
        action,
        correctSource,
        confidenceLevel: options.confidenceLevel || 'medium',
        isGroundTruth: options.isGroundTruth ?? true,
        usageCount: 0
    };

    // Only add optional fields if they have values
    if (options.originalSource !== undefined) example.originalSource = options.originalSource;
    if (options.correctionReason !== undefined) example.correctionReason = options.correctionReason;
    if (options.category !== undefined) example.category = options.category;
    if (options.justification !== undefined) example.justification = options.justification;
    if (options.correctedOcrText !== undefined) example.correctedOcrText = options.correctedOcrText;
    if (options.errorType !== undefined) example.errorType = options.errorType;

    // 1. Save to Firestore (source of truth)
    const docRef = await addDoc(collection(db, 'ground_truth_examples'), example);
    console.log('[Ground Truth] Saved to Firestore:', docRef.id, action, phrase);

    // 2. Index to Pinecone for semantic retrieval (async, non-blocking)
    upsertGroundTruthToPinecone(docRef.id, phrase, snippet, {
        ...example,
        action: action.toString() // Ensure enum is stringified
    }).catch(err => console.warn('[Ground Truth] Pinecone index failed (non-blocking):', err));

    return docRef.id;
}

/**
 * Get ground truth examples for a user
 * @param userId - User ID to filter by
 * @param maxExamples - Maximum number of examples to return (default 10, max 20)
 * @param onlyGroundTruth - If true, only return examples explicitly marked as ground truth
 */
export async function getGroundTruthExamples(
    userId: string,
    maxExamples: number = 10,
    onlyGroundTruth: boolean = true
): Promise<GroundTruthExample[]> {
    // Safety: Enforce maximum to prevent prompt bloating
    const safeLimit = Math.min(maxExamples, 20);

    let q = query(
        collection(db, 'ground_truth_examples'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(safeLimit)
    );

    if (onlyGroundTruth) {
        q = query(
            collection(db, 'ground_truth_examples'),
            where('userId', '==', userId),
            where('isGroundTruth', '==', true),
            orderBy('createdAt', 'desc'),
            limit(safeLimit)
        );
    }

    const snapshot = await getDocs(q);
    const examples: GroundTruthExample[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as GroundTruthExample));

    console.log(`[Ground Truth] Retrieved ${examples.length} examples (limit: ${safeLimit})`);
    return examples;
}

/**
 * Get categorized ground truth examples for prompt injection
 * Returns separate lists for IGNORE and APPROVE examples
 */
export async function getGroundTruthForPrompt(
    userId: string,
    maxExamples: number = 10
): Promise<{
    ignoreList: GroundTruthExample[];
    approveList: GroundTruthExample[];
    correctList: GroundTruthExample[];
}> {
    const examples = await getGroundTruthExamples(userId, maxExamples);

    const ignoreList = examples.filter(e =>
        e.action === GroundTruthAction.REJECT &&
        e.confidenceLevel === 'high'
    );

    const approveList = examples.filter(e =>
        e.action === GroundTruthAction.APPROVE &&
        e.confidenceLevel === 'high'
    );

    const correctList = examples.filter(e =>
        e.action === GroundTruthAction.CORRECT &&
        e.confidenceLevel === 'high'
    );

    console.log('[Ground Truth] Categorized:', {
        ignore: ignoreList.length,
        approve: approveList.length,
        correct: correctList.length
    });

    return { ignoreList, approveList, correctList };
}

/**
 * Track usage of a ground truth example
 */
export async function trackGroundTruthUsage(exampleId: string): Promise<void> {
    const docRef = doc(db, 'ground_truth_examples', exampleId);
    await updateDoc(docRef, {
        usageCount: (await (await getDocs(query(collection(db, 'ground_truth_examples'), where('__name__', '==', exampleId)))).docs[0]?.data()?.usageCount || 0) + 1,
        lastUsed: Timestamp.now()
    });
}

/**
 * Format ground truth examples for AI prompt injection
 */
export function formatGroundTruthForPrompt(examples: {
    ignoreList: GroundTruthExample[];
    approveList: GroundTruthExample[];
    correctList: GroundTruthExample[];
}): string {
    const { ignoreList, approveList, correctList } = examples;

    let promptAddition = '';

    if (ignoreList.length > 0) {
        promptAddition += '\n\n## ADDITIONAL IGNORE LIST (from your corrections):\n';
        promptAddition += ignoreList.map(e =>
            `- "${e.phrase}" - ${e.correctionReason || 'Marked as false positive'}`
        ).join('\n');
    }

    if (approveList.length > 0 || correctList.length > 0) {
        promptAddition += '\n\n## ADDITIONAL VERIFIED EXAMPLES (from your corrections):\n';

        approveList.forEach(e => {
            promptAddition += `\n- "${e.phrase}" → ${e.correctSource}`;
            if (e.correctionReason) promptAddition += ` (${e.correctionReason})`;
        });

        correctList.forEach(e => {
            promptAddition += `\n- "${e.phrase}" → ${e.correctSource} [CORRECTED from ${e.originalSource}]`;
            if (e.correctionReason) promptAddition += ` (${e.correctionReason})`;
        });
    }

    return promptAddition;
}
