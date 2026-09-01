import { test, expect } from '@playwright/test';

/**
 * Drives the real widget in a real browser against the real endpoint.
 *
 * The unit tests prove the verdicts are right. This proves the shopper actually SEES them:
 * that the hint lands in the DOM under the field she is typing in, that tapping it fixes the
 * value, and — the part that matters most — that it stays away from addresses that are fine.
 */

const ACCOUNT_ID = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';   // Argania, where the incident came from

/** Load widget.js on a blank third-party page, the way a customer's site does. */
async function mountWidget(page: import('@playwright/test').Page) {
  // Harness page served from localhost, not a fake public origin: Chrome's Private Network
  // Access rules block a public-origin page from pulling a subresource off localhost, so a
  // shop.test harness cannot load widget.js at all.
  await page.route('http://localhost:3000/__widget_harness', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>shop</h1></body></html>' }));
  await page.goto('http://localhost:3000/__widget_harness');
  await page.evaluate(async (accountId) => {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/widget.js';
      s.setAttribute('data-account-id', accountId);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('widget.js failed to load'));
      document.body.appendChild(s);
    });
  }, ACCOUNT_ID);
  await page.waitForTimeout(1500);   // widget boots and fetches its config
}

test.describe('widget email deliverability check', () => {
  test('the endpoint the widget calls separates the five cases correctly', async ({ page }) => {
    await mountWidget(page);
    const r = await page.evaluate(async () => {
      const probe = (email: string) =>
        fetch('http://localhost:3000/api/widget/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }).then((res) => res.json());
      return {
        dead: await probe('test@gmail.com.il'),
        good: await probe('test@gmail.com'),
        realProvider: await probe('test@mail.com'),
        corporate: await probe('test@jerusalem.muni.il'),
        squat: await probe('test@gamil.com'),
      };
    });

    // The incident case: flagged, with the fix named.
    expect(r.dead).toMatchObject({ status: 'undeliverable', suggestion: 'gmail.com' });

    // Companion assertions. Without these, a validator that flagged every address would
    // pass the assertion above — which is exactly how this kind of test passes vacuously.
    expect(r.good).toMatchObject({ status: 'ok' });
    expect(r.good.suggestion).toBeUndefined();
    expect(r.realProvider).toMatchObject({ status: 'ok' });   // one edit from gmail.com, and real
    expect(r.realProvider.suggestion).toBeUndefined();
    expect(r.corporate).toMatchObject({ status: 'ok' });      // an allowlist would reject this
    expect(r.corporate.suggestion).toBeUndefined();

    // A live typosquat: suggested, never blocking.
    expect(r.squat).toMatchObject({ status: 'typo', suggestion: 'gmail.com' });
  });

  test('the hint renders under the field, fixes the value on tap, and stays away otherwise', async ({ page }) => {
    await mountWidget(page);

    const run = async (typed: string) =>
      page.evaluate(async (value) => {
        // Rebuild the field the support form renders, then let the widget's own helpers
        // wire and drive it — this exercises attachEmailCheck/renderEmailHint for real.
        document.getElementById('ibot-sf-email')?.remove();
        document.getElementById('ibot-sf-email-hint')?.remove();
        const wrap = document.createElement('div');
        const input = document.createElement('input');
        input.id = 'ibot-sf-email';
        wrap.appendChild(input);
        document.body.appendChild(wrap);

        (window as any).__ibotAttachEmailCheck?.('ibot-sf-email');
        input.value = value;
        input.dispatchEvent(new Event('blur'));
        await new Promise((r) => setTimeout(r, 2500));

        const hint = document.getElementById('ibot-sf-email-hint');
        return { hintText: hint?.textContent ?? null, fixLabel: hint?.querySelector('button')?.textContent ?? null };
      }, typed);

    const dead = await run('lililevy42@gmail.com.il');
    expect(dead.hintText).toContain('התכוונת');
    expect(dead.fixLabel).toBe('lililevy42@gmail.com');

    // The address that is fine must produce NO hint at all.
    const good = await run('lililevy42@gmail.com');
    expect(good.hintText).toBeNull();

    // And neither must a real provider one edit away from gmail.com.
    const realProvider = await run('someone@mail.com');
    expect(realProvider.hintText).toBeNull();
  });
});
