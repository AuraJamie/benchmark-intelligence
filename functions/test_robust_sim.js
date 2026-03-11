import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function test() {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    try {
        const mainPage = await browser.newPage();
        await mainPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

        await mainPage.goto('https://planningaccess.york.gov.uk/online-applications/search.do?action=weeklyList', { waitUntil: 'networkidle2' });

        await Promise.all([
            mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
            mainPage.click('input.button.primary')
        ]);

        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage && pageNum <= 1) { // Just test 1 page
            const resultsCount = await mainPage.evaluate(() => document.querySelectorAll('#searchresults .searchresult').length);
            console.log(`Page ${pageNum} has ${resultsCount} results.`);

            for (let i = 0; i < Math.min(resultsCount, 3); i++) { // test first 3
                const appInfo = await mainPage.evaluate((index) => {
                    const a = document.querySelectorAll('#searchresults .searchresult')[index].querySelector('a');
                    return a ? a.innerText.trim() : '';
                }, i);

                console.log(`\nTesting result: ${appInfo}`);

                await Promise.all([
                    mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                    mainPage.evaluate((index) => document.querySelectorAll('#searchresults .searchresult')[index].querySelector('a').click(), i)
                ]);

                console.log("  Successfully on summary.");

                // Click further info tab
                await Promise.all([
                    mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                    mainPage.click('#subtab_details')
                ]);

                console.log("  Successfully on further info.");
                const content = await mainPage.content();
                const $ = cheerio.load(content);
                console.log("  Further info app received: ", $('th:contains("Application Received")').next('td').text().trim());

                // Let's find the URL or class for the back to search results button
                const backLinks = [];
                $('a').each((i, el) => {
                    if ($(el).text().includes('search results')) {
                        backLinks.push($(el).attr('href'));
                    }
                });
                console.log("  Back links:", backLinks);

                // Try to go back
                const backUrl = backLinks.length > 0 ? backLinks[0] : null;
                if (backUrl) {
                    await Promise.all([
                        mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
                        mainPage.goto('https://planningaccess.york.gov.uk' + backUrl, { waitUntil: 'networkidle2' })
                    ]);
                } else {
                    await mainPage.goBack();
                    await mainPage.goBack();
                }

                // check if we are on search list
                await mainPage.waitForSelector('#searchresults', { timeout: 10000 });
                console.log("  Successfully returned to search results.");
            }
            break;
        }

    } finally {
        await browser.close();
    }
}
test();
