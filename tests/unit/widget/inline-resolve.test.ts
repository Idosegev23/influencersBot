import { describe, it, expect } from 'vitest';
import { resolveInlineMount, chipBudget } from '@/lib/widget/inline';

const LDRS = {
  widget: {
    inline: {
      enabled: true,
      selector: '.content_home-c-hero',
      mode: 'into',
      preset: 'hero',
      surface: 'bare',
      reserve: { desktop: 0, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
      bubble: 'after-scroll',
    },
  },
};

describe('resolveInlineMount', () => {
  it('returns null when the account has no inline config — today behavior', () => {
    expect(resolveInlineMount({})).toBeNull();
    expect(resolveInlineMount({ widget: {} })).toBeNull();
    expect(resolveInlineMount(null)).toBeNull();
  });

  it('returns null when explicitly disabled', () => {
    expect(resolveInlineMount({ widget: { inline: { enabled: false, selector: '#x' } } })).toBeNull();
  });

  it('returns null when there is no selector to mount against', () => {
    expect(resolveInlineMount({ widget: { inline: { enabled: true } } })).toBeNull();
  });

  it('resolves the LDRS config verbatim', () => {
    // `paths` is the one resolved field LDRS's stored config does not carry:
    // absent means "every page", which is what every account configured before
    // the field existed already gets.
    expect(resolveInlineMount(LDRS)).toEqual({ ...LDRS.widget.inline, paths: null });
  });

  describe('paths — the mount is site-wide, the selector is not', () => {
    function withPaths(paths: unknown) {
      return resolveInlineMount({ widget: { inline: { enabled: true, selector: '#x', paths } } })!;
    }

    it('is null when absent, which means every page', () => {
      expect(withPaths(undefined).paths).toBeNull();
    });

    it('keeps a list of prefixes in order', () => {
      expect(withPaths(['/he', '/en/']).paths).toEqual(['/he', '/en/']);
    });

    it('drops non-strings and blanks rather than rejecting the whole mount', () => {
      expect(withPaths(['/he', 42, '', '   ', null, '/en']).paths).toEqual(['/he', '/en']);
    });

    it('trims entries', () => {
      expect(withPaths(['  /he  ']).paths).toEqual(['/he']);
    });

    it('caps the number of entries', () => {
      const many = Array.from({ length: 50 }, (_, i) => '/p' + i);
      expect(withPaths(many).paths).toHaveLength(20);
    });

    it('drops an over-long entry', () => {
      expect(withPaths(['/' + 'a'.repeat(400), '/ok']).paths).toEqual(['/ok']);
    });

    it('falls back to every page when nothing in the array is usable', () => {
      // Not "mount nowhere": a malformed paths value must not silently switch
      // the whole feature off for the account.
      expect(withPaths([]).paths).toBeNull();
      expect(withPaths([1, 2, 3]).paths).toBeNull();
      expect(withPaths('/he').paths).toBeNull();
    });
  });

  it('keeps the preview tri-state distinct from true', () => {
    const cfg = { widget: { inline: { enabled: 'preview', selector: '#x' } } };
    expect(resolveInlineMount(cfg)!.enabled).toBe('preview');
  });

  it('falls back to safe defaults for every optional field', () => {
    const r = resolveInlineMount({ widget: { inline: { enabled: true, selector: '#x' } } })!;
    expect(r.mode).toBe('into');
    expect(r.preset).toBe('hero');
    expect(r.surface).toBe('bare');
    expect(r.bubble).toBe('after-scroll');
    expect(r.theme.font).toBe('inherit');
    expect(r.reserve).toEqual({ desktop: 0, mobile: 0 });
  });

  it('rejects unknown enum values rather than passing them to the browser', () => {
    const r = resolveInlineMount({
      widget: { inline: { enabled: true, selector: '#x', mode: 'teleport', preset: 'carousel', surface: 'neon' } },
    })!;
    expect(r.mode).toBe('into');
    expect(r.preset).toBe('hero');
    expect(r.surface).toBe('bare');
  });

  it('drops an accent that is not a hex colour', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#x', theme: { accent: 'javascript:alert(1)' } } } };
    expect(resolveInlineMount(cfg)!.theme.accent).toBeNull();
  });

  it('rejects hex colours with an invalid digit count (5 or 7)', () => {
    const accent5 = resolveInlineMount({
      widget: { inline: { enabled: true, selector: '#x', theme: { accent: '#12345' } } },
    })!.theme.accent;
    const accent7 = resolveInlineMount({
      widget: { inline: { enabled: true, selector: '#x', theme: { accent: '#1234567' } } },
    })!.theme.accent;
    expect(accent5).toBeNull();
    expect(accent7).toBeNull();
  });

  it('accepts hex colours with a valid digit count (3, 4, 6, 8)', () => {
    for (const accent of ['#abc', '#abcd', '#aabbcc', '#aabbccdd']) {
      const cfg = { widget: { inline: { enabled: true, selector: '#x', theme: { accent } } } };
      expect(resolveInlineMount(cfg)!.theme.accent).toBe(accent);
    }
  });

  it('clamps a nonsense reserve', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#x', reserve: { desktop: -40, mobile: 99999 } } } };
    expect(resolveInlineMount(cfg)!.reserve).toEqual({ desktop: 0, mobile: 2000 });
  });

  it('refuses a selector long enough to be a payload', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#a'.repeat(300) } } };
    expect(resolveInlineMount(cfg)).toBeNull();
  });
});

describe('chipBudget', () => {
  it('gives three chips the room they need on desktop', () => {
    expect(chipBudget(1440)).toBe(3);
  });

  it('drops to two on a phone so the pill stays above the fold', () => {
    expect(chipBudget(390)).toBe(2);
  });

  it('drops to none on the narrowest phones', () => {
    expect(chipBudget(320)).toBe(0);
  });
});
