// Firestore Backup Export Script
// Run this BEFORE starting the migration to create a backup
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Firebase config (same as your app)
const firebaseConfig = {
    // TODO: Copy from your firebase.ts
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function exportFirestoreData() {
    console.log('🔵 Starting Firestore backup export...');

    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `firestore-backup-${timestamp}.json`);

    try {
        // Export receptionTrees collection
        const treesSnapshot = await getDocs(collection(db, 'receptionTrees'));
        const trees: any[] = [];

        treesSnapshot.forEach((doc) => {
            trees.push({
                id: doc.id,
                ...doc.data()
            });
        });

        const backup = {
            timestamp: new Date().toISOString(),
            collections: {
                receptionTrees: trees
            },
            metadata: {
                treeCount: trees.length,
                totalNodes: trees.reduce((sum, t) => sum + (t.nodes?.length || 0), 0),
                totalEdges: trees.reduce((sum, t) => sum + (t.edges?.length || 0), 0)
            }
        };

        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

        console.log('✅ Backup exported successfully!');
        console.log(`📁 Location: ${backupFile}`);
        console.log(`📊 Stats:`);
        console.log(`   - Trees: ${backup.metadata.treeCount}`);
        console.log(`   - Nodes: ${backup.metadata.totalNodes}`);
        console.log(`   - Edges: ${backup.metadata.totalEdges}`);

        return backupFile;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    exportFirestoreData()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { exportFirestoreData };
