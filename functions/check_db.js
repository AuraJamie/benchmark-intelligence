import { db } from './admin.js';

async function checkProjects() {
    try {
        const snapshot = await db.collection('projects').orderBy('timestamp', 'desc').limit(15).get();
        console.log(`Total projects in benchmark-db: ${snapshot.size}`);
        snapshot.docs.slice(0, 10).forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id} | Ref: ${data.reference} | Status: ${data.applicationStatus} | Rec: ${data.dateReceived} | Val: ${data.dateValidated}`);
        });
    } catch (err) {
        console.error(err);
    }
}

checkProjects();
