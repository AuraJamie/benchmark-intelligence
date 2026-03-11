import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runScraper } from "./scraper.js";

// Manually callable endpoint for the dashboard
export const scraper = onRequest({
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB"
}, async (req, res) => {
    console.log("ScraperSync - RECEIVED:", req.method, JSON.stringify(req.body));

    try {
        // Support any possible key the UI might send
        const targetWeek = req.query.targetWeek || req.body.targetWeek || req.body.week || null;
        console.log("ScraperSync - Processing with targetWeek:", targetWeek);

        const results = await runScraper(targetWeek);

        console.log("ScraperSync - Sync SUCCESS:", JSON.stringify(results));
        res.status(200).json({ success: true, message: "Sync complete.", data: results });
    } catch (error) {
        console.error("ScraperSync - FATAL ERROR:", error);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

// Automatic scheduled endpoint (runs every Friday at 5:00 PM)
export const scheduledSync = onSchedule({
    region: "europe-west2",
    schedule: "0 17 * * 5",
    timeoutSeconds: 540,
    memory: "2GiB",
    timeZone: "Europe/London"
}, async (event) => {
    try {
        console.log("Running scheduled sync...");
        await runScraper();
        console.log("Scheduled sync completed successfully.");
    } catch (error) {
        console.error("Scheduled sync failed:", error);
    }
});
