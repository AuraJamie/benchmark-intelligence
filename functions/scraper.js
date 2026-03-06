import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { db } from './admin.js';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

export async function runScraper() {
    const stats = { added: 0, skipped: 0, errors: 0 };
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

        console.log(`Establishing session via ${BASE_URL}/search.do?action=weeklyList`);
        await page.goto(`${BASE_URL}/search.do?action=weeklyList`, { waitUntil: 'networkidle2' });

        console.log("Submitting weekly list search...");

        // Wait for the form explicitly
        const formSelector = 'form[name="searchForm"], form#searchForm, form.search';
        await page.waitForSelector(formSelector, { timeout: 10000 }).catch(() => console.log('Could not find form specifically by name, trying generic forms...'));

        // We evaluate and submit the form directly in the browser context
        await page.evaluate(() => {
            const form = document.querySelector('form.search') || document.forms[0];
            if (!form) return;

            // These exact names/IDs might vary slightly on IDONOX systems depending on the council 
            // but the general structure remains:
            const searchType = document.querySelector('#searchCriteria_searchType') || form.querySelector('select[name*="searchType"]');
            if (searchType) searchType.value = 'Application';

            const dateType = document.querySelector('#dateType') || form.querySelector('select[name="dateType"]');
            if (dateType) dateType.value = 'DC_Decided';

            const dateListType = document.querySelector('#searchCriteria_dateListType') || form.querySelector('select[name*="dateListType"]');
            if (dateListType) dateListType.value = 'thisWeek';

            const submitBtn = form.querySelector('input.button.primary') || form.querySelector('input[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
            } else {
                form.submit();
            }
        });

        // wait for the results page to be loaded
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

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
                stats.skipped++;
                continue;
            }

            // We found a new extension. Let's dig deeper into the application details page.
            try {
                console.log(`Fetching details for ${keyVal}...`);

                // Navigate the puppeteer page to the detail URL
                await page.goto(url, { waitUntil: 'networkidle2' });
                const detailHtml = await page.content();
                const $detail = cheerio.load(detailHtml);

                // Note: Actual fields depending on York's markup structure.
                const fullDescription = $detail('th:contains("Proposal")').next('td').text().trim() || description;
                const applicantName = $detail('th:contains("Applicant")').next('td').text().trim() || "Unknown";

                const projectData = {
                    id: keyVal,
                    address: addressText,
                    description: fullDescription,
                    status: 'New',
                    applicantName: applicantName,
                    dateDecided: new Date().toISOString(),
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

        console.log(`Scrape finished. Added: ${stats.added}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
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
