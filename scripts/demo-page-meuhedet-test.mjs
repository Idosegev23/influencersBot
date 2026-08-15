import { chromium } from 'playwright';
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
await page.goto('https://influencers-bot.vercel.app/demo/4214549f-813b-406b-8b71-6550268235bb', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
await page.waitForTimeout(8000);
await page.screenshot({ path: SHOTS + '/meuhedet-demo-page.png' });
const frame = page.frames().find(f => f.url().includes('/api/widget/preview/'));
console.log('preview iframe:', !!frame);
if (frame) {
  const btn = await frame.$('#ibot-widget-button, [id*="ibot"]').catch(() => null);
  console.log('widget inside iframe:', !!btn);
  if (btn) {
    await btn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOTS + '/meuhedet-demo-page-open.png' });
  }
}
await browser.close();
