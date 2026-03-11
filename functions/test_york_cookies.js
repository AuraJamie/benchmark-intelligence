import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function test() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto('https://planningaccess.york.gov.uk/online-applications/search.do?action=weeklyList', { waitUntil: 'networkidle2' });

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('input.button.primary')
        ]);

        const html = await page.content();
        const $ = cheerio.load(html);
        const results = $('#searchresults .searchresult');
        console.log(`Initial search found ${results.length} results`);

        const urls = [];
        results.each((i, el) => {
            const relUrls = $(el).find('a').attr('href');
            if (relUrls && i < 2) urls.push('https://planningaccess.york.gov.uk/online-applications/' + relUrls);
        });

        for (const u of urls) {
            console.log("Visiting:", u);
            await page.goto(u, { waitUntil: 'networkidle2' });

            try {
                await page.waitForSelector('#simpleDetailsTable tr', { timeout: 10000 });
            } catch (err) {
                console.log("Timeout waiting for table");
            }
            const c = await page.content();
            const $2 = cheerio.load(c);
            console.log("Rows:", $2('#simpleDetailsTable tr').length);
        }

    } finally {
        await browser.close();
    }
}
test();
