/**
 * Migration Script: Legacy Graph Model → Simplified Model
 * 
 * Converts:
 * - Old: { nodes: GraphNode[], edges: GraphEdge[] }
 * - New: { root: RootNode, branches: BranchNode[] }
 * 
 * With composite IDs: ${treeId}-branch-${timestamp}-${index}
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import { ReceptionTree_LEGACY, ReceptionTree, RootNode, BranchNode, GraphNode, IDHelpers } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Firebase config
const firebaseConfig = {
    // TODO: Copy from firebase.ts
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface MigrationLog {
    timestamp: string;
    treesProcessed: number;
    treesSucceeded: number;
    treesFailed: number;
    details: {
        treeId: string;
        oldNodeCount: number;
        oldEdgeCount: number;
        newBranchCount: number;
        issues?: string[];
    }[];
    errors: { treeId: string; error: string }[];
}

/**
 * Migrate a single tree from legacy to new structure
 */
function migrateTree(legacyTree: ReceptionTree_LEGACY): {
    newTree: ReceptionTree;
    issues: string[];
} {
    const issues: string[] = [];
    const treeId = legacyTree.id;

    // 1. Find root node
    const rootNode = legacyTree.nodes.find(n => n.type === 'root') as RootNode | undefined;
    if (!rootNode) {
        throw new Error(`No root node found in tree ${treeId}`);
    }

    // 2. Find all branch nodes
    const branchNodes = legacyTree.nodes.filter(n => n.type === 'branch') as BranchNode[];

    // 3. Validate edges (for logging only)
    const connectedBranchIds = new Set(
        legacyTree.edges
            .filter(e => e.source === rootNode.id)
            .map(e => e.target)
    );

    const orphanedBranches = branchNodes.filter(b => !connectedBranchIds.has(b.id));
    if (orphanedBranches.length > 0) {
        issues.push(`Found ${orphanedBranches.length} orphaned branches (not connected via edges). They will still be migrated.`);
    }

    // 4. Generate new IDs for branches
    const newBranches: BranchNode[] = branchNodes.map((branch, index) => ({
        ...branch,
        id: IDHelpers.generateBranchId(treeId, index),
        position: branch.position || { x: 0, y: 0 } // Ensure position exists
    }));

    // 5. Update root ID
    const newRoot: RootNode = {
        ...rootNode,
        id: IDHelpers.generateRootId(treeId),
        position: rootNode.position || { x: 0, y: 0 }
    };

    // 6. Create new tree structure
    const newTree: ReceptionTree = {
        id: treeId,
        root: newRoot,
        branches: newBranches
    };

    return { newTree, issues };
}

/**
 * Main migration function
 */
async function runMigration(dryRun: boolean = true): Promise<MigrationLog> {
    const log: MigrationLog = {
        timestamp: new Date().toISOString(),
        treesProcessed: 0,
        treesSucceeded: 0,
        treesFailed: 0,
        details: [],
        errors: []
    };

    console.log(`🔵 Starting migration (DRY RUN: ${dryRun})...`);
    console.log('');

    try {
        // 1. Fetch all trees
        const treesSnapshot = await getDocs(collection(db, 'receptionTrees'));
        const legacyTrees: ReceptionTree_LEGACY[] = [];

        treesSnapshot.forEach((docSnap) => {
            legacyTrees.push({
                id: docSnap.id,
                ...docSnap.data()
            } as ReceptionTree_LEGACY);
        });

        console.log(`📊 Found ${legacyTrees.length} trees to migrate`);
        console.log('');

        // 2. Migrate each tree
        const batch = writeBatch(db);
        let batchOperations = 0;
        const BATCH_LIMIT = 400;

        for (const legacyTree of legacyTrees) {
            log.treesProcessed++;

            try {
                const { newTree, issues } = migrateTree(legacyTree);

                log.details.push({
                    treeId: legacyTree.id,
                    oldNodeCount: legacyTree.nodes.length,
                    oldEdgeCount: legacyTree.edges.length,
                    newBranchCount: newTree.branches.length,
                    issues: issues.length > 0 ? issues : undefined
                });

                if (!dryRun) {
                    const treeRef = doc(db, 'receptionTrees', legacyTree.id);
                    batch.set(treeRef, newTree);
                    batchOperations++;

                    // Commit batch if limit reached
                    if (batchOperations >= BATCH_LIMIT) {
                        await batch.commit();
                        console.log(`  ✅ Committed batch (${batchOperations} operations)`);
                        batchOperations = 0;
                    }
                }

                log.treesSucceeded++;
                console.log(`  ✅ ${legacyTree.id}: ${legacyTree.nodes.length} nodes → 1 root + ${newTree.branches.length} branches`);
                if (issues.length > 0) {
                    issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
                }

            } catch (error) {
                log.treesFailed++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                log.errors.push({ treeId: legacyTree.id, error: errorMsg });
                console.error(`  ❌ ${legacyTree.id}: ${errorMsg}`);
            }
        }

        // 3. Commit remaining batch
        if (!dryRun && batchOperations > 0) {
            await batch.commit();
            console.log(`  ✅ Committed final batch (${batchOperations} operations)`);
        }

        // 4. Save migration log
        const logDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `migration-log-${log.timestamp.replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

        console.log('');
        console.log('📊 Migration Summary:');
        console.log(`   - Total trees: ${log.treesProcessed}`);
        console.log(`   - Succeeded: ${log.treesSucceeded}`);
        console.log(`   - Failed: ${log.treesFailed}`);
        console.log(`   - Log saved: ${logFile}`);

        if (dryRun) {
            console.log('');
            console.log('🔵 DRY RUN MODE - No changes written to Firestore');
            console.log('   To apply changes, run: npm run migrate -- --no-dry-run');
        } else {
            console.log('');
            console.log('✅ Migration completed successfully!');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }

    return log;
}

// CLI handling
if (require.main === module) {
    const dryRun = !process.argv.includes('--no-dry-run');

    runMigration(dryRun)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { runMigration, migrateTree };
