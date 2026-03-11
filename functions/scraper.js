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
        const rows = $('table tr');
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
        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            console.log(`Scraping results page ${pageNum}...`);
            await mainPage.waitForSelector('#searchresults', { timeout: 10000 });

            // Count results dynamically from DOM structure
            const resultsCount = await mainPage.evaluate(() => document.querySelectorAll('#searchresults .searchresult').length);
            console.log(`  ${resultsCount} decided applications on page ${pageNum}.`);

            for (let i = 0; i < resultsCount; i++) {
                const appInfo = await mainPage.evaluate((index) => {
                    const el = document.querySelectorAll('#searchresults .searchresult')[index];
                    const a = el.querySelector('a');
                    const desc = a ? a.innerText.replace(/\s+/g, ' ').trim() : '';
                    const addr = el.querySelector('.address') ? el.querySelector('.address').innerText.replace(/\s+/g, ' ').trim() : '';
                    const href = a ? a.getAttribute('href') : '';
                    return { desc, addr, href };
                }, i);

                let isExtension = false;
                if (appInfo.desc.toLowerCase().includes('extension')) isExtension = true;

                if (!isExtension) {
                    continue; // Skip without navigating
                }

                if (!appInfo.href) continue;

                // We have a match! We click it, collect, and go back.
                const keyVal = new URLSearchParams(appInfo.href.split('?')[1]).get('keyVal');
                const detailUrl = `${BASE_URL}/applicationDetails.do?activeTab=summary&keyVal=${keyVal}`;

                console.log(`[${keyVal}] Clicking into summary tab... (${appInfo.desc.substring(0, 40)}...)`);

                const sleep = ms => new Promise(r => setTimeout(r, ms));

                // Jump into specific result
                await sleep(1000);
                try {
                    await Promise.all([
                        mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                        mainPage.evaluate((index) => document.querySelectorAll('#searchresults .searchresult')[index].querySelector('a').click(), i)
                    ]);
                } catch (err) {
                    console.warn(`  Navigation err for summary table on ${keyVal}`);
                }

                let summaryHtml = '';
                try {
                    await mainPage.waitForSelector('#simpleDetailsTable tr', { timeout: 8000 });
                    summaryHtml = await mainPage.content();
                } catch (err) {
                    console.warn(`  Timeout waiting for summary table for ${keyVal}`);
                }

                console.log(`[${keyVal}] Clicking further-info tab...`);
                let furtherInfoHtml = '';
                try {
                    await sleep(1000);
                    // Native click instead of goto to preserve session WAF state
                    await Promise.all([
                        mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                        mainPage.click('#subtab_details')
                    ]);
                    furtherInfoHtml = await mainPage.content();
                } catch (err) {
                    console.warn(`  Could not load further info tab for ${keyVal}: ${err.message}`);
                }

                const parsed = parseDetailPages([summaryHtml, furtherInfoHtml]);
                const fullDescription = parsed.fullDescription || appInfo.desc;
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

                // Process into DB
                const docRef = db.collection('projects').doc(keyVal);
                const existingDoc = await docRef.get();

                if (existingDoc.exists) {
                    const existing = existingDoc.data();
                    const updatePayload = {
                        reference: reference !== null ? reference : (existing.reference || null),
                        address: appInfo.addr || existing.address,
                        description: fullDescription || existing.description,
                        applicationStatus: appStatus || existing.applicationStatus || null,
                        applicantName: (applicantName && applicantName !== 'Unknown') ? applicantName : (existing.applicantName || null),
                        dateReceived: parsed.applicationReceived || existing.dateReceived || null,
                        dateValidated: parsed.applicationValidated || existing.dateValidated || null,
                        dateDecided: decidedDate.toISOString(),
                        url: detailUrl,
                    };
                    await docRef.update(updatePayload);
                    stats.existing++;
                } else {
                    const projectData = {
                        id: keyVal,
                        reference: reference || null,
                        address: appInfo.addr,
                        description: fullDescription,
                        status: 'New',
                        applicationStatus: appStatus,
                        applicantName: applicantName,
                        dateReceived: parsed.applicationReceived || null,
                        dateValidated: parsed.applicationValidated || null,
                        dateDecided: decidedDate.toISOString(),
                        url: detailUrl,
                        notes: '',
                        timestamp: new Date().toISOString()
                    };

                    try {
                        const encoded = encodeURIComponent(`${appInfo.addr}, York, UK`);
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
                    stats.added++;
                }

                // Navigate back safely using the portal's back link
                await sleep(1000);
                const content = await mainPage.content();
                const $h = cheerio.load(content);
                const backUrl = $h('a:contains("search results")').attr('href');
                if (backUrl) {
                    await Promise.all([
                        mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                        mainPage.goto('https://planningaccess.york.gov.uk' + backUrl, { waitUntil: 'networkidle2' })
                    ]);
                } else {
                    await mainPage.goBack();
                    await mainPage.goBack();
                }

                // Assert return to search results before processing next element, otherwise element offsets and queries crash
                await mainPage.waitForSelector('#searchresults', { timeout: 10000 });
            }

            const hasNext = await mainPage.evaluate(() => {
                const next = document.querySelector('a.next');
                if (next) { next.click(); return true; }
                return false;
            });

            if (hasNext) {
                await mainPage.waitForNavigation({ waitUntil: 'networkidle2' });
                pageNum++;
            } else {
                hasNextPage = false;
            }
        }

        console.log(`Done. Added: ${stats.added}, Existing: ${stats.existing}, Errors: ${stats.errors}`);

        // Log to Firestore for dashboard reporting
        await db.collection('scraper_logs').add({
            ...stats,
            totalFound: stats.added + stats.existing,
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
