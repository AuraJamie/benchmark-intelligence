import { runScraper } from './scraper.js';

console.log("Starting GitHub Actions Scraper Context...");
runScraper()
    .then(stats => {
        console.log("Job completed successfully.", stats);
        process.exit(0);
    })
    .catch(err => {
        console.error("Job failed:", err);
        process.exit(1);
    });
