/**
 * Data Review Dashboard Helpers
 * 
 * Utilities for pagination, harvesting GT, and managing branches.
 */

import { db } from '../firebase';
import {
    collection,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    where,
    Timestamp,
    DocumentData,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import { ReceptionTree, BranchNode, GroundTruthAction } from '../types';
import { saveGroundTruthExample } from './ground-truth-helpers';

// ========================================
// TYPES
// ========================================

export interface PaginatedResult<T> {
    data: T[];
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
}

export interface HarvestResult {
    status: 'created' | 'duplicate' | 'error';
    id?: string;
    message: string;
}

export interface BranchUpdate {
    author?: string;
    workTitle?: string;
    publicationDetails?: string;
    year?: string;
    referenceText?: string;
    userNotes?: string;
    category?: string;
    keywords?: string[];
}

export type ConnectionType =
    | 'direct_quote'
    | 'paraphrase'
    | 'allusion'
    | 'halakhic_discussion'
    | 'conceptual'
    | 'structural';

export interface HarvestMetadata {
    action: GroundTruthAction;
    connectionType: ConnectionType;
    category?: any; // GroundTruthCategory
    justification: string;
    confidenceLevel: 'high' | 'medium' | 'low';
}

// ========================================
// PAGINATION
// ========================================

/**
 * Fetch reception trees with pagination
 * 
 * @param lastDoc - Last document from previous page (null for first page)
 * @param pageSize - Number of trees to fetch (default: 10)
 * @returns Paginated result with trees and cursor
 */
export async function fetchTrees(
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
    pageSize: number = 10
): Promise<PaginatedResult<ReceptionTree>> {
    console.log(`[Data Review] Fetching ${pageSize} trees, cursor: ${lastDoc?.id || 'start'}`);

    let q = query(
        collection(db, 'receptionTrees'),
        orderBy('updatedAt', 'desc'),
        limit(pageSize + 1) // Fetch one extra to check if there are more
    );

    if (lastDoc) {
        q = query(
            collection(db, 'receptionTrees'),
            orderBy('updatedAt', 'desc'),
            startAfter(lastDoc),
            limit(pageSize + 1)
        );
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    // Check if there are more results
    const hasMore = docs.length > pageSize;
    const treeDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const trees: ReceptionTree[] = treeDocs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as ReceptionTree));

    console.log(`[Data Review] Fetched ${trees.length} trees, hasMore: ${hasMore}`);

    return {
        data: trees,
        lastDoc: treeDocs.length > 0 ? treeDocs[treeDocs.length - 1] : null,
        hasMore
    };
}

// ========================================
// HARVEST GROUND TRUTH
// ========================================

/**
 * Harvest an approved branch as Ground Truth
 * 
 * @param branch - The branch to harvest
 * @param rootSource - The root's Talmudic source (e.g., "Bavli Berakhot 2a")
 * @param userId - Current user ID
 * @param treeId - Tree ID for updating the branch
 * @param metadata - Optional rich metadata (action, connectionType, justification, etc.)
 * @returns Harvest result
 */
export async function harvestAsGroundTruth(
    branch: BranchNode,
    rootSource: string,
    userId: string,
    treeId: string,
    metadata?: HarvestMetadata
): Promise<HarvestResult> {
    console.log(`[Harvest] Starting harvest for branch ${branch.id}, source: ${rootSource}`);

    // Normalize phrase for deduplication (first 200 chars)
    const phrase = (branch.referenceText || '').substring(0, 200).trim();

    if (!phrase) {
        return { status: 'error', message: 'Branch has no reference text' };
    }

    // ========================================
    // CHECK FOR DUPLICATES
    // ========================================
    try {
        const existingQuery = query(
            collection(db, 'ground_truth_examples'),
            where('userId', '==', userId),
            where('phrase', '==', phrase),
            where('correctSource', '==', rootSource),
            limit(1)
        );

        const existing = await getDocs(existingQuery);

        if (!existing.empty) {
            console.log(`[Harvest] Duplicate GT exists: ${existing.docs[0].id}`);
            return {
                status: 'duplicate',
                id: existing.docs[0].id,
                message: 'This reference already exists as Ground Truth'
            };
        }
    } catch (error) {
        console.error('[Harvest] Error checking duplicates:', error);
        // Continue anyway - better to potentially duplicate than fail
    }

    // ========================================
    // SAVE NEW GROUND TRUTH
    // ========================================
    try {
        // Use provided metadata or defaults
        const action = metadata?.action || GroundTruthAction.APPROVE;
        const connectionType = metadata?.connectionType || 'allusion';
        const confidenceLevel = metadata?.confidenceLevel || 'high';

        // Encode rich metadata in justification (since the options type doesn't support extra fields)
        const baseJustification = metadata?.justification ||
            `Harvested from verified branch. Author: ${branch.author}, Work: ${branch.workTitle}`;
        const enrichedJustification = `${baseJustification}\n[Connection: ${connectionType}] [Author: ${branch.author}] [Work: ${branch.workTitle}]${branch.year ? ` [Year: ${branch.year}]` : ''}`;

        const gtId = await saveGroundTruthExample(
            userId,
            phrase,
            branch.referenceText, // Full text as snippet
            action,
            rootSource,
            {
                confidenceLevel,
                justification: enrichedJustification,
                isGroundTruth: true,
                category: metadata?.category
            }
        );

        console.log(`[Harvest] Created GT: ${gtId}`);

        // ========================================
        // MARK BRANCH AS HARVESTED
        // ========================================
        const treeRef = doc(db, 'receptionTrees', treeId);
        const treeSnap = await getDoc(treeRef);

        if (treeSnap.exists()) {
            const treeData = treeSnap.data() as ReceptionTree;
            const updatedBranches = (treeData.branches || []).map((b: BranchNode) => {
                if (b.id === branch.id) {
                    return { ...b, isHarvested: true, harvestedAt: Timestamp.now() };
                }
                return b;
            });

            await updateDoc(treeRef, {
                branches: updatedBranches,
                updatedAt: Timestamp.now()
            });
            console.log(`[Harvest] Marked branch ${branch.id} as harvested`);
        }

        return {
            status: 'created',
            id: gtId,
            message: 'Successfully harvested as Ground Truth!'
        };

    } catch (error: any) {
        console.error('[Harvest] Error saving GT:', error);
        return { status: 'error', message: error.message || 'Failed to harvest' };
    }
}

// ========================================
// DELETE BRANCH
// ========================================

/**
 * Delete a branch from a tree
 * If tree has 0 branches left, delete the tree entirely
 * 
 * @param treeId - Tree document ID
 * @param branchId - Branch ID to delete
 * @returns True if successful
 */
export async function deleteBranch(treeId: string, branchId: string): Promise<boolean> {
    console.log(`[Data Review] Deleting branch ${branchId} from tree ${treeId}`);

    try {
        const treeRef = doc(db, 'receptionTrees', treeId);
        const treeSnap = await getDoc(treeRef);

        if (!treeSnap.exists()) {
            console.error(`[Data Review] Tree ${treeId} not found`);
            return false;
        }

        const treeData = treeSnap.data() as ReceptionTree;
        const updatedBranches = (treeData.branches || []).filter(
            (b: BranchNode) => b.id !== branchId
        );

        // ========================================
        // AUTO-CLEANUP: Delete tree if no branches left
        // ========================================
        if (updatedBranches.length === 0) {
            console.log(`[Data Review] Tree ${treeId} has no branches left, deleting tree`);
            await deleteDoc(treeRef);
            return true;
        }

        // Update tree with remaining branches
        await updateDoc(treeRef, {
            branches: updatedBranches,
            updatedAt: Timestamp.now()
        });

        console.log(`[Data Review] Branch deleted, ${updatedBranches.length} branches remaining`);
        return true;

    } catch (error) {
        console.error('[Data Review] Error deleting branch:', error);
        return false;
    }
}

// ========================================
// UPDATE BRANCH
// ========================================

/**
 * Update any fields of a branch
 * 
 * @param treeId - Tree document ID
 * @param branchId - Branch ID to update
 * @param updates - Fields to update
 * @returns True if successful
 */
export async function updateBranch(
    treeId: string,
    branchId: string,
    updates: BranchUpdate
): Promise<boolean> {
    console.log(`[Data Review] Updating branch ${branchId} in tree ${treeId}`, updates);

    try {
        const treeRef = doc(db, 'receptionTrees', treeId);
        const treeSnap = await getDoc(treeRef);

        if (!treeSnap.exists()) {
            console.error(`[Data Review] Tree ${treeId} not found`);
            return false;
        }

        const treeData = treeSnap.data() as ReceptionTree;
        const updatedBranches = (treeData.branches || []).map((b: BranchNode) => {
            if (b.id === branchId) {
                return {
                    ...b,
                    ...updates,
                    // Don't overwrite these with undefined
                    author: updates.author ?? b.author,
                    workTitle: updates.workTitle ?? b.workTitle,
                    publicationDetails: updates.publicationDetails ?? b.publicationDetails,
                    year: updates.year ?? b.year,
                    referenceText: updates.referenceText ?? b.referenceText,
                    userNotes: updates.userNotes ?? b.userNotes
                };
            }
            return b;
        });

        await updateDoc(treeRef, {
            branches: updatedBranches,
            updatedAt: Timestamp.now()
        });

        console.log(`[Data Review] Branch ${branchId} updated successfully`);
        return true;

    } catch (error) {
        console.error('[Data Review] Error updating branch:', error);
        return false;
    }
}

// ========================================
// GROUP BY HELPERS
// ========================================

export interface GroupedTree {
    source: string;        // Root source (e.g., "Bavli Berakhot 2a")
    treeId: string;
    branches: BranchNode[];
    branchCount: number;
}

export interface GroupedByAuthor {
    author: string;
    branches: Array<{ branch: BranchNode; treeId: string; rootSource: string }>;
    totalCount: number;
}

/**
 * Group trees by Talmudic source (default view)
 */
export function groupBySource(trees: ReceptionTree[]): GroupedTree[] {
    return trees.map(tree => ({
        source: tree.root?.sourceText || tree.id,
        treeId: tree.id,
        branches: tree.branches || [],
        branchCount: (tree.branches || []).length
    }));
}

/**
 * Group all branches by author
 */
export function groupByAuthor(trees: ReceptionTree[]): GroupedByAuthor[] {
    const authorMap = new Map<string, GroupedByAuthor>();

    for (const tree of trees) {
        const rootSource = tree.root?.sourceText || tree.id;

        for (const branch of (tree.branches || [])) {
            const author = branch.author || 'Unknown';

            if (!authorMap.has(author)) {
                authorMap.set(author, { author, branches: [], totalCount: 0 });
            }

            const group = authorMap.get(author)!;
            group.branches.push({ branch, treeId: tree.id, rootSource });
            group.totalCount++;
        }
    }

    // Sort by count descending
    return Array.from(authorMap.values()).sort((a, b) => b.totalCount - a.totalCount);
}
