import { describe, it, expect } from 'vitest';
import {
  LANDING_LANGS,
  LANDING_STRINGS,
  getLandingStrings,
  landingDir,
} from '@/lib/i18n/landing';

/**
 * The catalog's `const en: LandingStrings` annotation already catches missing
 * keys at compile time — but `next.config.ts` sets `typescript.ignoreBuildErrors`,
 * so a type error does not stop a deploy. These tests are the check that does.
 *
 * The failure being guarded against is quiet: a key that exists but is empty, or
 * one where the English value is still the Hebrew text. Both render a page that
 * looks fine to whoever shipped it and broken to the visitor it was built for.
 */

const HEBREW = /[֐-׿]/;

/** Walk every leaf string in the catalog, remembering the path to it. */
function leaves(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('landing i18n catalog', () => {
  it('exposes exactly the languages the routes render', () => {
    expect(LANDING_LANGS).toEqual(['he', 'en']);
  });

  it('has identical key paths in every language', () => {
    const hePaths = leaves(LANDING_STRINGS.he).map(([p]) => p);
    const enPaths = leaves(LANDING_STRINGS.en).map(([p]) => p);

    // Arrays whose length differs between languages are legitimate (the English
    // nav drops the Hebrew-only onboarding guide), so compare the shape of the
    // objects rather than raw index paths.
    const shape = (paths: string[]) => new Set(paths.map((p) => p.replace(/\[\d+\]/g, '[]')));

    expect(shape(enPaths)).toEqual(shape(hePaths));
  });

  it('has no empty or whitespace-only strings', () => {
    for (const lang of LANDING_LANGS) {
      for (const [path, value] of leaves(LANDING_STRINGS[lang])) {
        expect(value.trim(), `${lang}.${path} is empty`).not.toBe('');
      }
    }
  });

  it('has no untranslated Hebrew left in the English catalog', () => {
    const untranslated = leaves(LANDING_STRINGS.en)
      .filter(([path, value]) => HEBREW.test(value) && path !== 'nav.switchLabel' && path !== 'nav.switchTitle')
      .map(([path]) => path);

    // nav.switchLabel/switchTitle are the exception on purpose: the switcher
    // names the target language in that language, so the English page's button
    // says "עברית".
    expect(untranslated).toEqual([]);
  });

  it('keeps the two lead-source labels distinguishable', () => {
    // Sales reads `serviceName` off the brief row to know which language to
    // reply in. Identical values would erase that signal.
    expect(LANDING_STRINGS.en.cta.serviceName).not.toBe(LANDING_STRINGS.he.cta.serviceName);
  });

  it('gives every capability card a visual slot', () => {
    // LandingPage zips `capabilities.cards` against a fixed 6-entry visual array
    // by index; a longer catalog would silently reuse icons.
    for (const lang of LANDING_LANGS) {
      expect(LANDING_STRINGS[lang].capabilities.cards).toHaveLength(6);
    }
  });

  it('only links English visitors to pages that exist in English', () => {
    // /onboarding-guide is Hebrew-only. Sending an English visitor there is a
    // dead end, so it must stay out of the English nav and footer.
    const enHrefs = [
      ...LANDING_STRINGS.en.nav.links.map((l) => l.href),
      ...LANDING_STRINGS.en.footer.links.map((l) => l.href),
    ];
    expect(enHrefs).not.toContain('/onboarding-guide');
  });
});

describe('getLandingStrings', () => {
  it('returns English only for an explicit en', () => {
    expect(getLandingStrings('en')).toBe(LANDING_STRINGS.en);
    expect(getLandingStrings('EN')).toBe(LANDING_STRINGS.en);
  });

  it('falls back to Hebrew for anything else', () => {
    for (const input of ['he', 'fr', '', null, undefined]) {
      expect(getLandingStrings(input)).toBe(LANDING_STRINGS.he);
    }
  });
});

describe('landingDir', () => {
  it('maps en to ltr and everything else to rtl', () => {
    expect(landingDir('en')).toBe('ltr');
    expect(landingDir('he')).toBe('rtl');
    expect(landingDir(null)).toBe('rtl');
  });
});
