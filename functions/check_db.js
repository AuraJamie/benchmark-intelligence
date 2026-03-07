import { db } from './admin.js';

async function checkProjects() {
    try {
        const snapshot = await db.collection('projects').get();
        console.log(`Total projects in benchmark-db: ${snapshot.size}`);
        snapshot.docs.slice(0, 10).forEach(doc => {
            console.log(`ID: ${doc.id}`);
        });
    } catch (err) {
        console.error(err);
    }
}

checkProjects();
