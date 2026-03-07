import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

async function testScraper() {
    let browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto(`${BASE_URL}/search.do?action=weeklyList`, { waitUntil: 'networkidle2' });

    // Perform search
    await page.evaluate(() => {
        const form = document.querySelector('form.search') || document.forms[0];
        if (!form) return;
        const searchType = document.querySelector('#searchCriteria_searchType') || form.querySelector('select[name*="searchType"]');
        if (searchType) searchType.value = 'Application';
        const dateDecidedRadio = form.querySelector('input[name="dateType"][value="DC_Decided"]') || document.querySelector('#dateDecided');
        if (dateDecidedRadio) dateDecidedRadio.checked = true;
        const dateListType = document.querySelector('#searchCriteria_dateListType') || form.querySelector('select[name*="dateListType"]');
        if (dateListType) dateListType.value = 'thisWeek';
        const submitBtn = form.querySelector('input.button.primary') || form.querySelector('input[type="submit"]');
        if (submitBtn) {
            submitBtn.click();
        } else {
            form.submit();
        }
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    let urlQueue = [];
    let hasNextPage = false;
    let pageNum = 1;

    do {
        console.log("Scraping page " + pageNum);
        const html = await page.content();
        const $ = cheerio.load(html);
        const searchResults = $('#searchresults .searchresult');

        for (const el of searchResults) {
            const item = $(el);
            const description = item.find('a').text().trim() || "";
            if (description.toLowerCase().includes('extension')) {
                const relativeUrl = item.find('a').attr('href');
                const url = new URL(relativeUrl, BASE_URL).href;
                const urlParams = new URLSearchParams(relativeUrl.split('?')[1]);
                const keyVal = urlParams.get('keyVal');
                const addressText = item.find('.address').text().trim() || "";
                if (keyVal) urlQueue.push({ url, keyVal, description, addressText });
            }
        }

        const nextLink = $('a.next').attr('href');
        if (nextLink) {
            hasNextPage = true;
            pageNum++;
            const absoluteNextUrl = new URL(nextLink, BASE_URL).href;
            console.log("Navigating to next page:", absoluteNextUrl);
            await page.goto(absoluteNextUrl, { waitUntil: 'networkidle2' });
        } else {
            hasNextPage = false;
        }
    } while (hasNextPage);

    console.log("Total extensions found across all pages:", urlQueue.length);
    fs.writeFileSync('dump2.json', JSON.stringify(urlQueue, null, 2));

    await browser.close();
}

testScraper().catch(console.error);
