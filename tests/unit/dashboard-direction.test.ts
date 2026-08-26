import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { dashboardDir, getDashboardStrings } from '@/lib/i18n/dashboard';

/**
 * The platform serves Israeli customers and American ones from the same code.
 * Direction therefore has to FOLLOW THE ACCOUNT, and it has exactly one owner:
 * the influencer layout, which reads `accounts.language`.
 *
 * These tests exist because it did not work that way. Fourteen dashboard pages
 * each pinned `dir="rtl"` on their own root, overriding the layout, so an
 * English account rendered English text in a right-to-left page: sentences
 * right-aligned and their full stops displaced to the front of the line
 * (".interactions across 99 posts").
 */

const DASH_ROOT = 'src/app/influencer';

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsxFilesUnder(p));
    else if (entry.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('direction follows the account, in both markets', () => {
  it('gives an Israeli account RTL and an American account LTR', () => {
    expect(dashboardDir('he')).toBe('rtl');
    expect(dashboardDir('en')).toBe('ltr');
  });

  it('keeps Hebrew as the fallback for anything unrecognised', () => {
    // A missing or malformed language must not silently flip an Israeli
    // customer's dashboard into a left-to-right layout.
    expect(dashboardDir(undefined as any)).toBe('rtl');
    expect(dashboardDir(null as any)).toBe('rtl');
    expect(dashboardDir('' as any)).toBe('rtl');
  });

  it('serves both string bundles, so neither market renders the other one', () => {
    expect(getDashboardStrings('he').nav).toBeDefined();
    expect(getDashboardStrings('en').nav).toBeDefined();
    expect(getDashboardStrings('en')).not.toEqual(getDashboardStrings('he'));
  });
});

describe('no dashboard page pins itself right-to-left', () => {
  it('leaves direction to the layout, which is the only thing that knows the account', () => {
    // Only `dir="rtl"` is an offence. `dir="ltr"` on a phone number, an email,
    // an order code or a URL input is bidi isolation — it keeps "+972-50…" from
    // being reordered inside a Hebrew sentence — and it is correct in BOTH
    // markets. Banning it would break the Israeli dashboard to tidy the American
    // one.
    const offenders = tsxFilesUnder(DASH_ROOT)
      .filter((f) => !f.endsWith('layout.tsx')) // the layout IS the owner
      .filter((f) => /dir="rtl"/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(`${DASH_ROOT}/`, ''));

    // Presence check first: if the scan found no files at all, an empty
    // `offenders` would pass for the wrong reason.
    expect(tsxFilesUnder(DASH_ROOT).length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
