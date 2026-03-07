import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';

const BASE_URL = 'https://planningaccess.york.gov.uk/online-applications';

async function testDetailScraper() {
    let browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Go to an application detail page
    const url = `${BASE_URL}/applicationDetails.do?keyVal=T9HDWOSJISG00&activeTab=summary`;
    await page.goto(url, { waitUntil: 'networkidle2' });

    const detailHtml = await page.content();
    const $detail = cheerio.load(detailHtml);

    let rows = [];
    $detail('tr').each((i, el) => {
        const th = $detail(el).find('th').text().trim();
        const td = $detail(el).find('td').text().trim();
        if (th && td) {
            rows.push({ th, td });
        }
    });

    fs.writeFileSync('detail_dump.json', JSON.stringify(rows, null, 2));

    await browser.close();
}

testDetailScraper().catch(console.error);
