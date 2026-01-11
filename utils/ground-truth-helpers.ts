import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { GroundTruthExample, GroundTruthAction, GroundTruthCategory } from '../types';
import { upsertGroundTruthToPinecone, embedTextsBatch, upsertGroundTruthBatch, GroundTruthBatchItem } from './rag-search';

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

// ========================================
// BATCH IMPORT/EXPORT (Phase 2: Cost Reduction)
// ========================================

/**
 * Progress callback type for batch operations
 */
export interface BatchImportProgress {
    stage: 'validating' | 'firestore' | 'embedding' | 'pinecone' | 'complete';
    current: number;
    total: number;
    message: string;
}

/**
 * Result of batch import operation
 */
export interface BatchImportResult {
    success: boolean;
    firestoreCount: number;
    pineconeSuccess: number;
    pineconeErrors: number;
    skippedItems: number;
    errors: string[];
    totalTime: number;
}

/**
 * Validates a Ground Truth JSON item
 */
function validateGTItem(item: any, index: number): { valid: boolean; error?: string } {
    if (!item.phrase || typeof item.phrase !== 'string') {
        return { valid: false, error: `Item ${index}: missing or invalid 'phrase'` };
    }
    if (!item.action || !['APPROVE', 'REJECT', 'CORRECT'].includes(item.action.toUpperCase())) {
        return { valid: false, error: `Item ${index}: invalid 'action' (must be APPROVE, REJECT, or CORRECT)` };
    }
    if (!item.correctSource && item.action.toUpperCase() !== 'REJECT') {
        return { valid: false, error: `Item ${index}: 'correctSource' required for APPROVE/CORRECT actions` };
    }
    return { valid: true };
}

/**
 * Import Ground Truth examples from JSON data.
 * 
 * Uses batch operations for efficiency:
 * 1. Firestore writeBatch (500 docs max per batch)
 * 2. Parallel embedding generation (5 concurrent)
 * 3. Pinecone batch upsert (50 vectors per batch)
 * 
 * @param jsonData - Array of GT items to import
 * @param userId - User ID to associate with all items
 * @param onProgress - Optional progress callback
 * @returns Import result with success/error counts
 */
export async function importGroundTruthFromJson(
    jsonData: any[],
    userId: string,
    onProgress?: (progress: BatchImportProgress) => void
): Promise<BatchImportResult> {
    const startTime = Date.now();
    const result: BatchImportResult = {
        success: false,
        firestoreCount: 0,
        pineconeSuccess: 0,
        pineconeErrors: 0,
        skippedItems: 0,
        errors: [],
        totalTime: 0
    };

    console.log(`[GT Batch Import] Starting import of ${jsonData.length} items for user ${userId}`);

    // ========================================
    // STEP 1: Validate JSON structure
    // ========================================
    onProgress?.({ stage: 'validating', current: 0, total: jsonData.length, message: 'Validating JSON structure...' });

    const validItems: any[] = [];
    for (let i = 0; i < jsonData.length; i++) {
        const validation = validateGTItem(jsonData[i], i);
        if (validation.valid) {
            validItems.push(jsonData[i]);
        } else {
            result.errors.push(validation.error!);
            result.skippedItems++;
        }
    }

    console.log(`[GT Batch Import] Validation: ${validItems.length} valid, ${result.skippedItems} skipped`);
    onProgress?.({ stage: 'validating', current: jsonData.length, total: jsonData.length, message: `${validItems.length} items validated` });

    if (validItems.length === 0) {
        result.errors.push('No valid items to import');
        result.totalTime = Date.now() - startTime;
        return result;
    }

    // ========================================
    // STEP 2: Save to Firestore (batch writes)
    // ========================================
    onProgress?.({ stage: 'firestore', current: 0, total: validItems.length, message: 'Saving to Firestore...' });

    const FIRESTORE_BATCH_SIZE = 450; // Firestore limit is 500, leave buffer
    const firestoreDocIds: string[] = [];

    for (let i = 0; i < validItems.length; i += FIRESTORE_BATCH_SIZE) {
        const batchItems = validItems.slice(i, i + FIRESTORE_BATCH_SIZE);
        const batch = writeBatch(db);

        for (const item of batchItems) {
            const docRef = doc(collection(db, 'ground_truth_examples'));
            const normalizedAction = item.action.toUpperCase() as GroundTruthAction;

            const docData: Record<string, any> = {
                userId,
                createdAt: Timestamp.now(),
                phrase: item.phrase,
                snippet: item.snippet || item.phrase,
                action: normalizedAction,
                correctSource: item.correctSource || (normalizedAction === 'REJECT' ? 'N/A' : ''),
                confidenceLevel: item.confidenceLevel || 'high', // Imported data is assumed high confidence
                isGroundTruth: true,
                usageCount: 0,
                importedAt: Timestamp.now()
            };

            // Optional fields
            if (item.originalSource) docData.originalSource = item.originalSource;
            if (item.correctionReason) docData.correctionReason = item.correctionReason;
            if (item.category) docData.category = item.category;
            if (item.justification) docData.justification = item.justification;

            batch.set(docRef, docData);
            firestoreDocIds.push(docRef.id);
        }

        try {
            await batch.commit();
            result.firestoreCount += batchItems.length;
            console.log(`[GT Batch Import] Firestore batch ${Math.floor(i / FIRESTORE_BATCH_SIZE) + 1}: ${batchItems.length} docs saved`);
        } catch (error) {
            console.error(`[GT Batch Import] Firestore batch failed:`, error);
            result.errors.push(`Firestore batch ${Math.floor(i / FIRESTORE_BATCH_SIZE) + 1} failed: ${error}`);
        }

        onProgress?.({
            stage: 'firestore',
            current: Math.min(i + FIRESTORE_BATCH_SIZE, validItems.length),
            total: validItems.length,
            message: `Saved ${result.firestoreCount} to Firestore...`
        });
    }

    console.log(`[GT Batch Import] Firestore complete: ${result.firestoreCount} documents saved`);

    // ========================================
    // STEP 3: Generate embeddings (batch)
    // ========================================
    onProgress?.({ stage: 'embedding', current: 0, total: validItems.length, message: 'Generating embeddings...' });

    // Build text to embed: phrase + snippet
    const textsToEmbed = validItems.map(item =>
        `${item.phrase} ${item.snippet || ''}`.substring(0, 8000)
    );

    const embeddings = await embedTextsBatch(
        textsToEmbed,
        5, // 5 parallel requests
        (completed, total) => {
            onProgress?.({
                stage: 'embedding',
                current: completed,
                total,
                message: `Generating embeddings: ${completed}/${total}`
            });
        }
    );

    const successfulEmbeddings = embeddings.filter(e => e && e.length > 0).length;
    console.log(`[GT Batch Import] Embeddings complete: ${successfulEmbeddings}/${validItems.length} successful`);

    // ========================================
    // STEP 4: Upsert to Pinecone (batch)
    // ========================================
    onProgress?.({ stage: 'pinecone', current: 0, total: validItems.length, message: 'Indexing to Pinecone...' });

    // Build batch items for Pinecone
    const batchItems: GroundTruthBatchItem[] = validItems.map((item, idx) => ({
        id: firestoreDocIds[idx] || `imported-${Date.now()}-${idx}`,
        phrase: item.phrase,
        snippet: item.snippet || item.phrase,
        userId,
        action: item.action.toUpperCase(),
        correctSource: item.correctSource || '',
        originalSource: item.originalSource,
        correctionReason: item.correctionReason,
        confidenceLevel: item.confidenceLevel || 'high',
        category: item.category
    }));

    const pineconeResult = await upsertGroundTruthBatch(
        batchItems,
        embeddings,
        50, // 50 vectors per Pinecone batch
        (completed, total) => {
            onProgress?.({
                stage: 'pinecone',
                current: completed,
                total,
                message: `Indexing to Pinecone: ${completed}/${total}`
            });
        }
    );

    result.pineconeSuccess = pineconeResult.successCount;
    result.pineconeErrors = pineconeResult.errorCount;

    // ========================================
    // COMPLETE
    // ========================================
    result.success = result.firestoreCount > 0;
    result.totalTime = Date.now() - startTime;

    console.log(`[GT Batch Import] COMPLETE in ${result.totalTime}ms:`, {
        firestore: result.firestoreCount,
        pinecone: `${result.pineconeSuccess} success, ${result.pineconeErrors} errors`,
        skipped: result.skippedItems
    });

    onProgress?.({
        stage: 'complete',
        current: validItems.length,
        total: validItems.length,
        message: `Import complete: ${result.firestoreCount} saved, ${result.pineconeSuccess} indexed`
    });

    return result;
}

/**
 * Export all Ground Truth examples for a user to JSON
 */
export async function exportGroundTruthToJson(userId: string): Promise<GroundTruthExample[]> {
    console.log(`[GT Export] Exporting all GT examples for user ${userId}`);

    const q = query(
        collection(db, 'ground_truth_examples'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(1000) // Reasonable limit
    );

    const snapshot = await getDocs(q);
    const examples: GroundTruthExample[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            phrase: data.phrase,
            snippet: data.snippet,
            action: data.action,
            correctSource: data.correctSource,
            originalSource: data.originalSource,
            correctionReason: data.correctionReason,
            confidenceLevel: data.confidenceLevel,
            category: data.category,
            justification: data.justification,
            isGroundTruth: data.isGroundTruth,
            createdAt: data.createdAt,
            userId: data.userId
        } as GroundTruthExample;
    });

    console.log(`[GT Export] Exported ${examples.length} examples`);
    return examples;
}
