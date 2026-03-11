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

        console.log("Search done. Visiting first result via click.");

        // click the first search result link
        const links = await page.$$('.searchresult a');
        if (links.length > 0) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                links[0].click()
            ]);

            try {
                await page.waitForSelector('#simpleDetailsTable tr', { timeout: 10000 });
                const html = await page.content();
                const $ = cheerio.load(html);
                console.log("Rows first:", $('#simpleDetailsTable tr').length);
            } catch (err) {
                console.log("Timeout waiting for table first page");
            }

            console.log("Going back...");
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.goBack()
            ]);

            console.log("Visiting second result via click.");
            const links2 = await page.$$('.searchresult a');
            if (links2.length > 1) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    links2[1].click()
                ]);

                try {
                    await page.waitForSelector('#simpleDetailsTable tr', { timeout: 10000 });
                    const html2 = await page.content();
                    const $2 = cheerio.load(html2);
                    console.log("Rows second:", $2('#simpleDetailsTable tr').length);
                } catch (err) {
                    console.log("Timeout waiting for table second page");
                }
            }
        }
    } finally {
        await browser.close();
    }
}
test();
