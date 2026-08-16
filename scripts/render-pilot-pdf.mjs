import { chromium } from 'playwright';
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('file://' + src, { waitUntil: 'networkidle' });
await page.pdf({ path: out, format: 'Letter', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await browser.close();
console.log('PDF written:', out);
