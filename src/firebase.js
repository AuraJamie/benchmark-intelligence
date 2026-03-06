import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyBZCrrTwBlfUDnMhDSmNFouTBUKKTTQ8Lw",
    authDomain: "benchmark-intelligence-a5b7c.firebaseapp.com",
    projectId: "benchmark-intelligence-a5b7c",
    storageBucket: "benchmark-intelligence-a5b7c.firebasestorage.app",
    messagingSenderId: "785316881089",
    appId: "1:785316881089:web:ab9e5ec6da05d072146a40",
    measurementId: "G-LZ1GGR56XJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app, "benchmark-db");
