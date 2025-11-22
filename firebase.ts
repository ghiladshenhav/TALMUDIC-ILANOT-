import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "talmudic-reception-trees.firebaseapp.com",
  projectId: "talmudic-reception-trees",
  storageBucket: "talmudic-reception-trees.firebasestorage.app",
  messagingSenderId: "1081944959110",
  appId: "1:1081944959110:web:a3220fde47189f8e7e4907",
  measurementId: "G-C611M9TBVL"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
