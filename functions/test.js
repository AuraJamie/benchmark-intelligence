import { runScraper } from './scraper.js';

async function testFetch() {
    console.log("Starting manual scraper test...");
    try {
        const results = await runScraper();
        console.log("Scraper Test Success:", results);
    } catch (error) {
        console.error("Scraper Test Failed:", error);
    }
}

testFetch();
