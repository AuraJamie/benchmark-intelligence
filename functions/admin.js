import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// In development, load env vars. In production, Firebase Functions handles this automatically.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

// Default initializeApp without arguments uses the Application Default Credentials
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("Initializing Firebase with Service Account from ENV...");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    console.log("Initializing Firebase with Default Credentials...");
    initializeApp();
}

export const db = getFirestore('benchmark-db');
