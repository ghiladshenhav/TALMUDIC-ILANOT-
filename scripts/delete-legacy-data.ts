import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

// Use the same config as firebase.ts (hardcoded for the cleanup script)
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "placeholder", // API key from env if available
    authDomain: "talmudic-reception-trees.firebaseapp.com",
    projectId: "talmudic-reception-trees",
    storageBucket: "talmudic-reception-trees.firebasestorage.app",
    messagingSenderId: "1081944959110",
    appId: "1:1081944959110:web:a3220fde47189f8e7e4907",
};

console.log("Firebase Config:");
console.log("Project ID:", firebaseConfig.projectId);
console.log("Connecting to Firestore...\n");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteLegacyData() {
    console.log("Fetching all trees...");
    const snapshot = await getDocs(collection(db, "receptionTrees"));
    console.log(`Found ${snapshot.docs.length} trees.`);

    let deletedCount = 0;
    let keptCount = 0;

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const isLegacy = !data.root || !data.branches;

        if (isLegacy) {
            console.log(`Deleting legacy tree: ${docSnap.id}`);
            await deleteDoc(doc(db, "receptionTrees", docSnap.id));
            deletedCount++;
        } else {
            console.log(`Keeping valid tree: ${docSnap.id}`);
            keptCount++;
        }
    }

    console.log("\n--- Cleanup Complete ---");
    console.log(`Deleted: ${deletedCount} legacy trees`);
    console.log(`Kept: ${keptCount} valid trees`);
}

deleteLegacyData().catch(console.error);
