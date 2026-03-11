import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
    try {
        const res = await axios.get('https://planningaccess.york.gov.uk/online-applications/applicationDetails.do?keyVal=SKX2GNSJMII00&activeTab=summary', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                // Add commonly required headers
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });
        const $ = cheerio.load(res.data);
        const rows = $('#simpleDetailsTable tr');
        console.log('Rows found:', rows.length);
        rows.each((i, row) => {
            console.log($(row).find('th').text().trim(), ':', $(row).find('td').text().trim());
        });
    } catch (err) {
        console.error('Error fetching directly:', err.message);
    }
}
test();
