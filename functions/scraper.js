import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { db } from './admin.js';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

export async function runScraper() {
    const stats = { added: 0, existing: 0, errors: 0, filtered: 0 };
    let browser = null;

    try {
        console.log("Starting scraper...");

        // Launch puppeteer in headless mode
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Disguise as a regular browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log(`Establishing session via ${BASE_URL}/search.do?action=monthlyList`);
        await page.goto(`${BASE_URL}/search.do?action=monthlyList`, { waitUntil: 'networkidle2' });

        console.log("Submitting monthly list search...");

        // Wait for the form explicitly
        const formSelector = 'form[name="searchCriteriaForm"], form#monthlyListForm';
        await page.waitForSelector(formSelector, { timeout: 10000 });

        // Select the most recent month (usually already selected but being explicit)
        await page.evaluate(() => {
            const monthSelect = document.querySelector('#month');
            if (monthSelect && monthSelect.options.length > 0) {
                // We'll keep the default (current/latest month)
            }
        });

        // Use Puppeteer's native click to trigger React/DOM events to guarantee the radio group state updates on CI
        try {
            const radioSelector = 'input[name="dateType"][value="DC_Decided"]';
            await page.waitForSelector(radioSelector, { timeout: 5000 });
            await page.click(radioSelector);
            // wait a tiny bit for UI state
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.log('Warning: could not click DC_Decided radio natively.');
        }

        // Submit form and wait for the results page to load
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.evaluate(() => {
                const form = document.querySelector('form#monthlyListForm') || document.forms[0];
                const submitBtn = form.querySelector('input.button.primary') || form.querySelector('input[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                } else {
                    form.submit();
                }
            })
        ]);

        let hasNextPage = false;
        let pageNum = 1;
        const extensionApps = [];

        do {
            console.log(`Scraping search results page ${pageNum}...`);
            const html = await page.content();
            const $ = cheerio.load(html);
            const searchResults = $('#searchresults .searchresult');

            console.log(`Found ${searchResults.length} decided applications on page ${pageNum}. Filtering for extensions...`);

            // Extract extensions from this page
            for (const el of searchResults) {
                const item = $(el);
                const description = item.find('a').text().trim() || "";

                if (description.toLowerCase().includes('extension')) {
                    const relativeUrl = item.find('a').attr('href');
                    const url = new URL(relativeUrl, BASE_URL).href;

                    const urlParams = new URLSearchParams(relativeUrl.split('?')[1]);
                    const keyVal = urlParams.get('keyVal');

                    if (!keyVal) continue;

                    const addressText = item.find('.address').text().trim() || "";
                    extensionApps.push({ keyVal, url, description, addressText });
                }
            }

            // Check for a 'Next' page link in the pagination
            const nextLink = $('a.next').attr('href');
            if (nextLink) {
                hasNextPage = true;
                pageNum++;
                const absoluteNextUrl = new URL(nextLink, BASE_URL).href;
                console.log(`Navigating to next page: ${absoluteNextUrl}`);
                await page.goto(absoluteNextUrl, { waitUntil: 'networkidle2' });
            } else {
                hasNextPage = false;
            }
        } while (hasNextPage);

        console.log(`Extracted a total of ${extensionApps.length} extension applications from all pages.`);

        // Now iterate through the collected extensions
        for (const app of extensionApps) {
            const { keyVal, url, description, addressText } = app;

            // Check if it already exists in DB
            const docRef = db.collection('projects').doc(keyVal);
            const existingDoc = await docRef.get();

            if (existingDoc.exists) {
                stats.existing++;
                continue;
            }

            // We found a new extension. Let's dig deeper into the application details page.
            try {
                console.log(`Fetching details for ${keyVal}...`);

                // Navigate with a slightly longer timeout and wait for network to be truly idle
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

                try {
                    // Wait longer for the table to appear, as York's portal can be slow
                    await page.waitForSelector('#simpleDetailsTable', { timeout: 15000 });
                } catch (e) {
                    console.log(`Warning: #simpleDetailsTable not found for ${keyVal}. Page may not have loaded or session might be invalid.`);
                }

                const detailHtml = await page.content();
                const $detail = cheerio.load(detailHtml);

                // Initialize fields
                let fullDescription = description;
                let applicantName = "Unknown";
                let reference = null;
                let applicationReceived = null;
                let applicationValidated = null;
                let appStatus = "Unknown";
                let decisionText = "";
                let decisionDateStr = "";

                // Iterate through all table rows to find matches regardless of exact header text
                $detail('#simpleDetailsTable tr, .detailstable tr').each((i, row) => {
                    const th = $detail(row).find('th').text().trim().toLowerCase();
                    const td = $detail(row).find('td').text().trim();

                    if (th.includes('proposal') || th.includes('description')) fullDescription = td;
                    if (th.includes('applicant')) applicantName = td;
                    if (th === 'reference' || th === 'ref. no:') reference = td;
                    if (th.includes('received')) applicationReceived = td;
                    if (th.includes('validated')) applicationValidated = td;
                    if (th === 'status' || th === 'app status') appStatus = td;

                    // Specific logic for Decision to avoid Date/Type headers
                    if ((th.includes('decision') && !th.includes('date') && !th.includes('type')) || th === 'decision') {
                        // If we haven't found a better decision, or if this is the primary "Decision" field
                        if (!decisionText || th === 'decision') {
                            decisionText = td;
                        }
                    }
                    if (th.includes('decision') && th.includes('date')) decisionDateStr = td;
                });

                const lowerDecision = decisionText.toLowerCase();
                // Highly inclusive approval check - include everything that implies a positive outcome
                const isApproved = lowerDecision.includes('approv') ||
                    lowerDecision.includes('grant') ||
                    lowerDecision.includes('permit') ||
                    lowerDecision.includes('allow') ||
                    lowerDecision.includes('accept') ||
                    lowerDecision.includes('lawful') ||
                    lowerDecision.includes('consent');

                if (!decisionText || !isApproved) {
                    console.log(`Skipping ${keyVal}: Not approved or decision missing. Value: "${decisionText}"`);
                    stats.filtered++;
                    continue;
                }

                let decidedDate = new Date();
                if (decisionDateStr) {
                    const parsed = new Date(decisionDateStr);
                    if (!isNaN(parsed)) decidedDate = parsed;
                }

                const projectData = {
                    id: keyVal,
                    reference: reference || null,
                    address: addressText,
                    description: fullDescription,
                    status: 'New',
                    applicationStatus: appStatus || decisionText || 'Unknown',
                    applicantName: applicantName,
                    dateReceived: applicationReceived || null,
                    dateValidated: applicationValidated || null,
                    dateDecided: decidedDate.toISOString(),
                    url: url,
                    notes: '',
                    collectionId: null,
                    timestamp: new Date(),
                    coordinates: null // Placeholder
                };

                // Geocoding via Nominatim (OpenStreetMap)
                try {
                    console.log(`Geocoding address: ${addressText}...`);
                    const encodedAddress = encodeURIComponent(`${addressText}, York, UK`);
                    // Nominatim usage policy requires an identifying User-Agent
                    const geoResponse = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`, {
                        headers: { 'User-Agent': 'BenchmarkIntelligence/1.0 (jamie.dark.business@gmail.com)' }
                    });

                    if (geoResponse.data && geoResponse.data.length > 0) {
                        const location = geoResponse.data[0];
                        projectData.coordinates = {
                            lat: parseFloat(location.lat),
                            lng: parseFloat(location.lon)
                        };
                        console.log(`Found coordinates: ${location.lat}, ${location.lon}`);
                    } else {
                        console.log(`No coordinates found for: ${addressText}`);
                    }
                } catch (geoErr) {
                    console.error(`Geocoding failed for ${keyVal}:`, geoErr.message);
                }

                await docRef.set(projectData);
                stats.added++;

                // Wait briefly to avoid hitting the council servers too violently
                await new Promise(r => setTimeout(r, 750));

            } catch (detailErr) {
                console.error(`Error scraping detail page for ${keyVal}:`, detailErr.message);
                stats.errors++;
            }
        }

        console.log(`Scrape finished. Added: ${stats.added}, Existing: ${stats.existing}, Filtered: ${stats.filtered}, Errors: ${stats.errors}`);

        // Log stats to Firestore for dashboard reporting
        try {
            await db.collection('scraper_logs').add({
                ...stats,
                totalFound: extensionApps.length,
                timestamp: new Date(),
                status: 'completed'
            });
        } catch (logErr) {
            console.error("Failed to log stats to Firestore:", logErr);
        }

        return stats;

    } catch (error) {
        console.error("Scraper failed:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
