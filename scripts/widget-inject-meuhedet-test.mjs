import { chromium } from 'playwright';
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
await page.goto('https://www.meuhedet.co.il/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const s = document.createElement('script');
  s.src = 'https://influencers-bot.vercel.app/widget.js';
  s.setAttribute('data-account-id', '4214549f-813b-406b-8b71-6550268235bb');
  document.body.appendChild(s);
});
await page.waitForTimeout(4000);
const btn = await page.$('#ibot-widget-button, [id*="ibot"]');
console.log('widget button:', !!btn);
await btn.click();
await page.waitForTimeout(2000);
const input = await page.$('#ibot-widget-container textarea, #ibot-widget-container input[type="text"], [id*="ibot"] textarea, [id*="ibot"] input');
console.log('input found:', !!input);
if (input) {
  await input.type('אילו שירותים יש לילדים במאוחדת?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(20000);
}
await page.screenshot({ path: SHOTS + '/meuhedet-widget-chat.png' });
console.log('chat screenshot saved');
await browser.close();
