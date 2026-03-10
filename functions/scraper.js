import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { db } from './admin.js';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';
const CONCURRENT_PAGES = 3; // Fetch up to 3 detail pages simultaneously

/**
 * Extracts all fields from a detail page's #simpleDetailsTable.
 * Merges rows from multiple tab pages (e.g. summary + further-info).
 */
function parseDetailPages(htmlList) {
    const fields = {};

    for (const html of htmlList) {
        const $ = cheerio.load(html);
        const rows = $('#simpleDetailsTable tr');
        console.log(`    Table rows found: ${rows.length}`);

        rows.each((i, row) => {
            const th = $(row).find('th').text().replace(/\s+/g, ' ').trim().toLowerCase();
            const td = $(row).find('td').text().replace(/\s+/g, ' ').trim();
            if (th && td) {
                // Don't overwrite already-found non-empty values
                if (!fields[th]) {
                    fields[th] = td;
                    console.log(`    "${th}" => "${td.substring(0, 60)}"`);
                }
            }
        });
    }

    // Use decision text as status when portal shows a generic/blank status
    const rawStatus = fields['status'] || null;
    const decisionText = fields['decision'] || null;
    const effectiveStatus = (rawStatus && rawStatus !== 'Unknown') ? rawStatus : (decisionText || rawStatus || null);

    return {
        reference: fields['reference'] || fields['ref. no:'] || null,
        applicantName: fields['applicant name'] || fields['applicant'] || null,
        applicationReceived: fields['application received'] || fields['date received'] || null,
        applicationValidated: fields['application validated'] || fields['date validated'] || null,
        appStatus: effectiveStatus,
        decisionText: decisionText,
        decisionDateStr: fields['decision issued date'] || fields['decision date'] || null,
        fullDescription: fields['proposal'] || fields['description'] || null,
    };
}

/**
 * Fetch a single detail page using a dedicated Puppeteer tab.
 * Uses 'networkidle2' to ensure the server has finished sending all content
 * (York's portal streams HTML in chunks, so domcontentloaded fires too early).
 */
async function fetchDetailWithPage(tabPage, url) {
    await tabPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    try {
        await tabPage.waitForSelector('#simpleDetailsTable tr', { timeout: 8000 });
    } catch (_) {
        console.warn(`  Table rows not found for: ${url}`);
    }
    return tabPage.content();
}

export async function runScraper(targetWeekOverride = null) {
    const stats = { added: 0, existing: 0, errors: 0 };
    let browser = null;

    try {
        console.log("Starting scraper...");

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const mainPage = await browser.newPage();
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        await mainPage.setUserAgent(UA);

        // --- PHASE 1: Establish session and submit the weekly search form ---
        console.log('Establishing session and submitting search...');
        await mainPage.goto(`${BASE_URL}/search.do?action=weeklyList`, { waitUntil: 'networkidle2' });
        await mainPage.waitForSelector('form#weeklyListForm, form[name="searchCriteriaForm"]', { timeout: 10000 });

        let targetWeekValue;
        if (targetWeekOverride) {
            targetWeekValue = targetWeekOverride;
            console.log(`Using overridden target week: ${targetWeekValue}`);
        } else {
            // Calculate the Date of Monday for the current week (WB Date)
            const now = new Date();
            const day = now.getDay();
            const diffToAdd = day === 0 ? -6 : 1 - day;
            const monday = new Date(now.getTime() + diffToAdd * 24 * 60 * 60 * 1000);

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const dayStr = String(monday.getDate()).padStart(2, '0');
            const monthStr = monthNames[monday.getMonth()];
            const yearStr = monday.getFullYear();
            targetWeekValue = `${dayStr} ${monthStr} ${yearStr}`;
            console.log(`Target Week Beginning (WB) Date calculated as: ${targetWeekValue}`);
        }

        // Try to select the calculated week or fallback to the most recent one
        const availableOptions = await mainPage.evaluate(() => {
            const select = document.querySelector('select#week');
            return select ? Array.from(select.options).map(o => o.value) : [];
        });

        if (availableOptions.includes(targetWeekValue)) {
            await mainPage.select('select#week', targetWeekValue);
            console.log(`Successfully selected week: ${targetWeekValue}`);
        } else {
            console.log(`Warning: Target week "${targetWeekValue}" not found in dropdown. Available top option: ${availableOptions[0]}`);
            if (availableOptions.length > 0) {
                await mainPage.select('select#week', availableOptions[0]);
                console.log(`Fell back to latest available week: ${availableOptions[0]}`);
            }
        }

        await mainPage.click('input[name="dateType"][value="DC_Decided"]').catch(() => {
            console.log('Warning: could not click DC_Decided radio.');
        });
        await new Promise(r => setTimeout(r, 300));

        await Promise.all([
            mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
            mainPage.evaluate(() => {
                const form = document.querySelector('form#weeklyListForm') || document.forms[0];
                const btn = form.querySelector('input.button.primary') || form.querySelector('input[type="submit"]');
                if (btn) btn.click(); else form.submit();
            })
        ]);

        // --- PHASE 2: Collect all extension apps across all pages ---
        const extensionApps = [];
        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            console.log(`Scraping results page ${pageNum}...`);
            const html = await mainPage.content();
            const $ = cheerio.load(html);
            const results = $('#searchresults .searchresult');
            console.log(`  ${results.length} decided applications on page ${pageNum}.`);

            results.each((i, el) => {
                const item = $(el);
                const description = item.find('a').text().replace(/\s+/g, ' ').trim();
                if (!description.toLowerCase().includes('extension')) return;

                const relativeUrl = item.find('a').attr('href');
                if (!relativeUrl) return;

                const keyVal = new URLSearchParams(relativeUrl.split('?')[1]).get('keyVal');
                if (!keyVal) return;

                const detailUrl = `${BASE_URL}/applicationDetails.do?activeTab=summary&keyVal=${keyVal}`;
                const addressText = item.find('.address').text().replace(/\s+/g, ' ').trim();
                extensionApps.push({ keyVal, url: detailUrl, description, addressText });
            });

            const nextLink = $('a.next').attr('href');
            if (nextLink) {
                pageNum++;
                await mainPage.goto(new URL(nextLink, BASE_URL).href, { waitUntil: 'networkidle2' });
            } else {
                hasNextPage = false;
            }
        }

        console.log(`Found ${extensionApps.length} extension applications in total.`);

        // --- PHASE 3: Open concurrent browser tabs for fast detail page fetching ---
        // Copy session cookies from mainPage so all tabs share the authenticated session
        const sessionCookies = await mainPage.cookies();
        const tabs = [];
        for (let i = 0; i < CONCURRENT_PAGES; i++) {
            const tab = await browser.newPage();
            await tab.setUserAgent(UA);
            if (sessionCookies.length > 0) {
                await tab.setCookie(...sessionCookies);
            }
            tabs.push(tab);
        }

        // --- PHASE 4: Process all apps using a work queue with concurrent tabs ---
        let queueIndex = 0;

        async function processApp(app, tab) {
            const { keyVal, url, description, addressText } = app;
            const docRef = db.collection('projects').doc(keyVal);

            try {
                console.log(`[${keyVal}] Fetching summary tab...`);
                const summaryHtml = await fetchDetailWithPage(tab, url);

                // Also fetch the "Further Information" tab which contains applicant name
                const detailsUrl = url.replace('activeTab=summary', 'activeTab=details');
                console.log(`[${keyVal}] Fetching further-info tab...`);
                const furtherInfoHtml = await fetchDetailWithPage(tab, detailsUrl);

                const parsed = parseDetailPages([summaryHtml, furtherInfoHtml]);

                const fullDescription = parsed.fullDescription || description;
                const applicantName = parsed.applicantName || 'Unknown';
                const reference = parsed.reference;
                const appStatus = parsed.appStatus || parsed.decisionText || 'Unknown';
                const decisionText = parsed.decisionText || '';

                console.log(`[${keyVal}] ref=${reference || 'null'}, decision="${decisionText}", status="${appStatus}"`);

                let decidedDate = new Date();
                if (parsed.decisionDateStr) {
                    const p = new Date(parsed.decisionDateStr);
                    if (!isNaN(p)) decidedDate = p;
                }

                const existingDoc = await docRef.get();

                if (existingDoc.exists) {
                    const existing = existingDoc.data();
                    // Always write freshly-scraped values. Only fall back to existing if scraped value is absent.
                    const updatePayload = {
                        reference: reference !== null ? reference : (existing.reference || null),
                        address: addressText || existing.address,
                        description: fullDescription || existing.description,
                        applicationStatus: appStatus || existing.applicationStatus || null,
                        applicantName: (applicantName && applicantName !== 'Unknown') ? applicantName : (existing.applicantName || null),
                        dateReceived: parsed.applicationReceived || existing.dateReceived || null,
                        dateValidated: parsed.applicationValidated || existing.dateValidated || null,
                        dateDecided: decidedDate.toISOString(),
                        url: url,
                    };
                    console.log(`[${keyVal}] Updating: ref=${updatePayload.reference}, received=${updatePayload.dateReceived}`);
                    await docRef.update(updatePayload);
                    stats.existing++;
                } else {
                    const projectData = {
                        id: keyVal,
                        reference: reference || null,
                        address: addressText,
                        description: fullDescription,
                        status: 'New',
                        applicationStatus: appStatus,
                        applicantName: applicantName,
                        dateReceived: parsed.applicationReceived || null,
                        dateValidated: parsed.applicationValidated || null,
                        dateDecided: decidedDate.toISOString(),
                        url: url,
                        notes: '',
                        collectionId: null,
                        timestamp: new Date(),
                        coordinates: null,
                    };

                    // Geocode the address
                    try {
                        const encoded = encodeURIComponent(`${addressText}, York, UK`);
                        const geo = await axios.get(
                            `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
                            { headers: { 'User-Agent': 'BenchmarkIntelligence/1.0 (jamie.dark.business@gmail.com)' }, timeout: 8000 }
                        );
                        if (geo.data && geo.data.length > 0) {
                            projectData.coordinates = {
                                lat: parseFloat(geo.data[0].lat),
                                lng: parseFloat(geo.data[0].lon),
                            };
                            console.log(`[${keyVal}] Geocoded: ${geo.data[0].lat}, ${geo.data[0].lon}`);
                        }
                    } catch (geoErr) {
                        console.warn(`[${keyVal}] Geocoding failed: ${geoErr.message}`);
                    }

                    await docRef.set(projectData);
                    console.log(`[${keyVal}] Added new.`);
                    stats.added++;
                }
            } catch (err) {
                console.error(`[${keyVal}] Error: ${err.message}`);
                stats.errors++;
            }
        }

        // Distribute work across concurrent tabs
        async function runWorker(tab) {
            while (queueIndex < extensionApps.length) {
                const app = extensionApps[queueIndex++];
                await processApp(app, tab);
            }
        }

        // Run all workers concurrently
        await Promise.all(tabs.map(tab => runWorker(tab)));

        console.log(`Done. Added: ${stats.added}, Existing: ${stats.existing}, Errors: ${stats.errors}`);

        // Log to Firestore for dashboard reporting
        await db.collection('scraper_logs').add({
            ...stats,
            totalFound: extensionApps.length,
            timestamp: new Date(),
            status: 'completed'
        });

        return stats;

    } catch (error) {
        console.error("Scraper failed:", error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}
