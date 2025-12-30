/**
 * Script to verify ground truth examples in Firestore
 * Run with: npx ts-node scripts/check-ground-truth.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';

// Firebase config - same as firebase.ts
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkGroundTruth() {
    console.log('\n=== GROUND TRUTH EXAMPLES (ground_truth_examples collection) ===\n');

    const gtQuery = query(
        collection(db, 'ground_truth_examples'),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    const snapshot = await getDocs(gtQuery);

    if (snapshot.empty) {
        console.log('❌ No ground truth examples found in Firestore!');
        return;
    }

    console.log(`✅ Found ${snapshot.size} ground truth examples:\n`);

    let reshutCount = 0;
    snapshot.forEach((doc, index) => {
        const data = doc.data();
        const phrase = data.phrase || data.snippet || '';
        const isReshut = phrase.includes('רשות') || data.correctSource?.includes('Shabbat');

        if (isReshut) reshutCount++;

        console.log(`${index + 1}. [${data.action}] "${phrase.substring(0, 60)}..."`);
        console.log(`   Source: ${data.correctSource || 'N/A'}`);
        console.log(`   Created: ${data.createdAt?.toDate?.() || 'Unknown'}`);
        console.log(`   isGroundTruth: ${data.isGroundTruth}`);
        if (data.justification) {
            console.log(`   Justification: ${data.justification.substring(0, 100)}...`);
        }
        console.log('');
    });

    console.log(`\n📊 Summary: Found ${reshutCount} entries related to "רשות" / Shabbat`);
}

async function checkTrainingExamples() {
    console.log('\n=== AI TRAINING EXAMPLES (ai_training_examples collection) ===\n');

    const trainingQuery = query(
        collection(db, 'ai_training_examples'),
        orderBy('timestamp', 'desc'),
        limit(50)
    );

    const snapshot = await getDocs(trainingQuery);

    if (snapshot.empty) {
        console.log('❌ No training examples found in Firestore!');
        return;
    }

    console.log(`✅ Found ${snapshot.size} training examples:\n`);

    let positiveCount = 0;
    let negativeCount = 0;
    let reshutCount = 0;

    snapshot.forEach((doc, index) => {
        const data = doc.data();
        const text = data.text || '';
        const isReshut = text.includes('רשות');

        if (data.isPositive) positiveCount++;
        else negativeCount++;
        if (isReshut) reshutCount++;

        console.log(`${index + 1}. [${data.isPositive ? '✅ POSITIVE' : '❌ NEGATIVE'}] "${text.substring(0, 60)}..."`);
        console.log(`   Source: ${data.source || 'N/A'}`);
        console.log(`   isGroundTruth: ${data.isGroundTruth}`);
        console.log(`   addedManually: ${data.addedManually}`);
        if (data.explanation) {
            console.log(`   Explanation: ${data.explanation.substring(0, 100)}...`);
        }
        console.log('');
    });

    console.log(`\n📊 Summary: ${positiveCount} positive, ${negativeCount} negative, ${reshutCount} related to "רשות"`);
}

async function main() {
    try {
        await checkGroundTruth();
        await checkTrainingExamples();
    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

main();
