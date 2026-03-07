import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'firebase-key.json'), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore('benchmark-db');

async function deepDiagnose() {
    const lines = [];

    lines.push('=== PROJECTS COLLECTION ===');
    const snap = await db.collection('projects').get();
    lines.push(`Total documents in 'projects': ${snap.size}`);
    snap.docs.forEach(d => lines.push(`  Doc ID: ${d.id} | address: ${d.data().address || 'N/A'}`));

    lines.push('');
    lines.push('=== SCRAPER_LOGS COLLECTION ===');
    const logs = await db.collection('scraper_logs').orderBy('timestamp', 'desc').limit(5).get();
    lines.push(`Total recent logs: ${logs.size}`);
    logs.docs.forEach(d => {
        const data = d.data();
        const ts = data.timestamp ? new Date(data.timestamp.toMillis()).toISOString() : 'no timestamp';
        lines.push(`  Log at ${ts}: added=${data.added}, existing=${data.existing}, filtered=${data.filtered}, errors=${data.errors}, totalFound=${data.totalFound}`);
    });

    const out = lines.join('\n');
    console.log(out);
    writeFileSync('/tmp/debug_out.txt', out);
}

deepDiagnose().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
