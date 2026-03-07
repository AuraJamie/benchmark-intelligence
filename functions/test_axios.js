// Quick test: run only the search + fetch ONE detail page to verify field extraction
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

async function fetchDetail(url, cookies) {
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
            'Cookie': cookieString,
            'Referer': `${BASE_URL}/search.do?action=monthlyList`,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        timeout: 20000,
    });
    return response.data;
}

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36');

    console.log('Loading monthly list...');
    await page.goto(`${BASE_URL}/search.do?action=monthlyList`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('form#monthlyListForm, form[name="searchCriteriaForm"]', { timeout: 10000 });
    await page.click('input[name="dateType"][value="DC_Decided"]').catch(() => { });
    await new Promise(r => setTimeout(r, 300));

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
    console.log(`Found ${results.length} results`);

    // Find first extension
    let firstExt = null;
    results.each((i, el) => {
        if (firstExt) return;
        const desc = $(el).find('a').text().replace(/\s+/g, ' ').trim();
        if (desc.toLowerCase().includes('extension')) {
            const href = $(el).find('a').attr('href');
            const keyVal = new URLSearchParams(href.split('?')[1]).get('keyVal');
            firstExt = {
                keyVal,
                url: `${BASE_URL}/applicationDetails.do?activeTab=summary&keyVal=${keyVal}`,
                description: desc,
                addressText: $(el).find('.address').text().replace(/\s+/g, ' ').trim()
            };
        }
    });

    if (!firstExt) { console.log('No extension found!'); await browser.close(); return; }

    // Extract cookies
    const cookies = await page.cookies();
    console.log(`Extracted ${cookies.length} cookies`);
    await browser.close();

    console.log(`\nFetching detail for ${firstExt.keyVal} via axios...`);
    const detailHtml = await fetchDetail(firstExt.url, cookies);
    writeFileSync('C:/tmp/detail_axios.html', detailHtml);
    console.log('Saved HTML to C:/tmp/detail_axios.html');

    const $d = cheerio.load(detailHtml);
    const fields = {};
    $d('#simpleDetailsTable tr').each((i, row) => {
        const th = $d(row).find('th').text().replace(/\s+/g, ' ').trim().toLowerCase();
        const td = $d(row).find('td').text().replace(/\s+/g, ' ').trim();
        if (th && td) { fields[th] = td; console.log(`  th="${th}" => "${td}"`); }
    });

    console.log('\nExtracted:');
    console.log(`  reference:    ${fields['reference'] || 'NULL'}`);
    console.log(`  applicant:    ${fields['applicant name'] || fields['applicant'] || 'NULL'}`);
    console.log(`  received:     ${fields['application received'] || 'NULL'}`);
    console.log(`  validated:    ${fields['application validated'] || 'NULL'}`);
    console.log(`  status:       ${fields['status'] || 'NULL'}`);
    console.log(`  decision:     ${fields['decision'] || 'NULL'}`);
    console.log(`  decisionDate: ${fields['decision issued date'] || 'NULL'}`);
})().catch(console.error);
