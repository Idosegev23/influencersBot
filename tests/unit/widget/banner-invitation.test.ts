import { describe, it, expect } from 'vitest';
import { resolveInvitation } from '@/lib/widget/banner';

const at = (d: string) => new Date(`${d}T09:00:00Z`);

describe('resolveInvitation', () => {
  it('is null on both when nothing is configured', () => {
    expect(resolveInvitation({}, 'widget')).toEqual({ teaser: null, tooltip: null });
  });

  it('reads the account defaults', () => {
    const cfg = { widget: { teaser: 'שלום', tooltip: 'דברו איתי' } };
    expect(resolveInvitation(cfg, 'widget')).toEqual({ teaser: 'שלום', tooltip: 'דברו איתי' });
  });

  it('an open override replaces the teaser', () => {
    const cfg = {
      widget: { teaser: 'שלום' },
      overrides: [{ from: '2026-08-01', until: '2026-08-31', teaser: 'מבצע!' }],
    };
    expect(resolveInvitation(cfg, 'widget', at('2026-08-10')).teaser).toBe('מבצע!');
  });

  it('a closed override leaves the default', () => {
    const cfg = {
      widget: { teaser: 'שלום' },
      overrides: [{ from: '2026-08-01', until: '2026-08-05', teaser: 'מבצע!' }],
    };
    expect(resolveInvitation(cfg, 'widget', at('2026-08-10')).teaser).toBe('שלום');
  });

  it('trims and caps long copy', () => {
    const cfg = { widget: { teaser: '  ' + 'א'.repeat(200) + '  ' } };
    expect(resolveInvitation(cfg, 'widget').teaser!.length).toBe(140);
  });
});
