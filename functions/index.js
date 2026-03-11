import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runScraper } from "./scraper.js";

// Manually callable endpoint for the dashboard
export const triggerSync = onRequest({ cors: true, timeoutSeconds: 540, memory: "2GiB" }, async (req, res) => {
    try {
        const targetWeek = req.query.targetWeek || req.body.targetWeek || null;
        const results = await runScraper(targetWeek);
        res.status(200).json({ success: true, message: "Sync complete.", data: results });
    } catch (error) {
        console.error("Manual sync failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Automatic scheduled endpoint (runs every Friday at 5:00 PM)
export const scheduledSync = onSchedule({
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
