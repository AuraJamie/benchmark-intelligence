import { runScraper } from './scraper.js';

console.log("Starting GitHub Actions Scraper Context...");

const targetWeek = process.argv[2] && process.argv[2] !== 'null' && process.argv[2] !== '' ? process.argv[2] : null;
if (targetWeek) {
    console.log(`Received targetWeek argument: ${targetWeek}`);
}

runScraper(targetWeek)
    .then(stats => {
        console.log("Job completed successfully.", stats);
        process.exit(0);
    })
    .catch(err => {
        console.error("Job failed:", err);
        process.exit(1);
    });
