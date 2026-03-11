import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function test() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Go straight to the detail page
        await page.goto('https://planningaccess.york.gov.uk/online-applications/applicationDetails.do?activeTab=summary&keyVal=T9HDWOSJISG00', { waitUntil: 'networkidle2' });

        try {
            await page.waitForSelector('#simpleDetailsTable tr', { timeout: 8000 });
        } catch (_) {
            console.log("No table rows found (timeout)");
        }

        const html = await page.content();
        const $ = cheerio.load(html);
        const rows = $('#simpleDetailsTable tr');
        console.log('Rows found:', rows.length);
        rows.each((i, row) => {
            console.log($(row).find('th').text().trim(), ':', $(row).find('td').text().trim());
        });
    } catch (err) {
        console.error('Error fetching directly:', err.message);
    } finally {
        await browser.close();
    }
}
test();
