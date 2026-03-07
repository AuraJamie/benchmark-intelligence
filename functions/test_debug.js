import * as cheerio from 'cheerio';
const html = `<table id="simpleDetailsTable"><tr><th>Decision</th><td id="Decision">LHE Approved</td></tr><tr><th>Decision Issued Date</th><td id="Decision Issued Date">Thu 05 Mar 2026</td></tr></table>`;
const $detail = cheerio.load(html);
const decisionText = $detail('th:contains("Decision")').next('td').text().trim();
console.log("Extracted:", decisionText);
