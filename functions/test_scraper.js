import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { writeFileSync, appendFileSync } from 'fs';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';
const LOG = 'C:/tmp/scraper_detail.log';

function log(msg) {
    console.log(msg);
    appendFileSync(LOG, msg + '\n');
}

writeFileSync(LOG, '');

async function testScraper() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36');

    log('Loading monthly list...');
    await page.goto(`${BASE_URL}/search.do?action=monthlyList`, { waitUntil: 'networkidle2' });

    try {
        await page.waitForSelector('form#monthlyListForm, form[name="searchCriteriaForm"]', { timeout: 10000 });
        await page.click('input[name="dateType"][value="DC_Decided"]').catch(() => { });
        await new Promise(r => setTimeout(r, 500));
    } catch (e) { }

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.evaluate(() => {
            const form = document.querySelector('form#monthlyListForm') || document.forms[0];
            const btn = form.querySelector('input.button.primary') || form.querySelector('input[type="submit"]');
            if (btn) btn.click(); else form.submit();
        })
    ]);

    const html = await page.content();
    const $ = cheerio.load(html);
    const results = $('#searchresults .searchresult');
    log(`Found ${results.length} results`);

    let firstExt = null;
    results.each((i, el) => {
        if (firstExt) return;
        const desc = $(el).find('a').text().trim();
        if (desc.toLowerCase().includes('extension')) {
            const href = $(el).find('a').attr('href');
            const url = new URL(href, BASE_URL).href;
            const keyVal = new URLSearchParams(href.split('?')[1]).get('keyVal');
            firstExt = { url, keyVal, desc };
        }
    });

    if (!firstExt) { log('No extension found!'); await browser.close(); return; }
    log(`Testing: ${firstExt.keyVal} - ${firstExt.desc}`);
    log(`URL: ${firstExt.url}`);

    await page.goto(firstExt.url, { waitUntil: 'networkidle2', timeout: 30000 });
    try { await page.waitForSelector('#simpleDetailsTable', { timeout: 10000 }); log('TABLE FOUND'); } catch (e) { log('TABLE NOT FOUND'); }

    const detailHtml = await page.content();

    // Save the raw HTML for inspection
    writeFileSync('C:/tmp/detail_page.html', detailHtml);
    log('Saved raw HTML to C:/tmp/detail_page.html');

    const $d = cheerio.load(detailHtml);

    const allTables = $d('table');
    log(`Total tables: ${allTables.length}`);
    allTables.each((i, t) => {
        log(`  Table ${i}: id="${$d(t).attr('id') || ''}" class="${$d(t).attr('class') || ''}"`);
    });

    log('\n--- All rows from #simpleDetailsTable ---');
    $d('#simpleDetailsTable tr').each((i, row) => {
        const th = $d(row).find('th').text().replace(/\s+/g, ' ').trim();
        const td = $d(row).find('td').text().replace(/\s+/g, ' ').trim();
        log(`  [${i}] th="${th}" | td="${td}"`);
    });

    log('\n--- All decision-related rows (ALL tables) ---');
    $d('table tr').each((i, row) => {
        const th = $d(row).find('th').text().replace(/\s+/g, ' ').trim().toLowerCase();
        const td = $d(row).find('td').text().replace(/\s+/g, ' ').trim();
        if (th.includes('decision') || th.includes('status')) {
            log(`  th="${th}" | td="${td}"`);
        }
    });

    await browser.close();
}

testScraper().catch(e => { log('ERROR: ' + e.message); });
