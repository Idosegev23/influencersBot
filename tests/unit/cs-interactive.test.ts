import { describe, it, expect } from 'vitest';
import {
  buildBrandDisambiguationList,
  buildBrandConfirmButtons,
  buildThreadReentryList,
  buildSingleThreadButtons,
} from '@/lib/cs/interactive';

describe('cs interactive builders', () => {
  it('disambiguation list encodes accountId into row ids and truncates titles', () => {
    const r = buildBrandDisambiguationList([
      { accountId: 'acc-1', displayName: 'Argania', username: 'argania', domain: 'argania-oil.co.il', score: 0.9 },
      { accountId: 'acc-2', displayName: 'A Very Long Brand Name That Exceeds Limit', username: 'x', domain: null, score: 0.7 },
    ]);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows[0].id).toBe('brand_acc-1');
    expect(rows[1].title.length).toBeLessThanOrEqual(24);
    expect(r.buttonLabel.length).toBeLessThanOrEqual(20);
  });

  it('confirm buttons carry yes/no ids and brand name + domain in body', () => {
    const r = buildBrandConfirmButtons({
      accountId: 'acc-1', displayName: 'Argania', username: 'argania', domain: 'argania-oil.co.il', score: 0.9,
    });
    expect(r.kind).toBe('buttons');
    if (r.kind !== 'buttons') return;
    expect(r.buttons.map((b) => b.id)).toEqual(['confirm_yes', 'confirm_no']);
    expect(r.body).toContain('Argania');
    expect(r.body).toContain('argania-oil.co.il');
    expect(r.buttons.length).toBeLessThanOrEqual(3);
  });

  it('reentry list appends a "new inquiry" row', () => {
    const r = buildThreadReentryList([
      { ticketId: 't1', brandName: 'Argania', topic: 'שאלה על מוצר' },
      { ticketId: 't2', brandName: 'LA BEAUTÉ', topic: 'מוצר פגום' },
    ]);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows.map((x) => x.id)).toContain('thread_new');
    expect(rows[0].id).toBe('thread_t1');
  });

  it('single-thread buttons use continue/other ids', () => {
    const r = buildSingleThreadButtons('LA BEAUTÉ', 'מוצר פגום');
    expect(r.kind).toBe('buttons');
    if (r.kind !== 'buttons') return;
    expect(r.buttons.map((b) => b.id)).toEqual(['reentry_continue', 'reentry_other']);
  });
});
