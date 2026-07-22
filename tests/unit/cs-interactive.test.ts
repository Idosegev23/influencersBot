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

  it('brand disambiguation list truncates to exactly 10 rows when given >10 candidates', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      accountId: `acc-${i + 1}`,
      displayName: `Brand ${i + 1}`,
      username: `brand${i + 1}`,
      domain: `brand${i + 1}.com`,
      score: 0.9,
    }));
    const r = buildBrandDisambiguationList(candidates);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows).toHaveLength(10);
  });

  it('reentry list truncates to exactly 10 rows (9 threads + 1 new inquiry) when given >9 threads', () => {
    const threads = Array.from({ length: 12 }, (_, i) => ({
      ticketId: `t${i + 1}`,
      brandName: `Brand ${i + 1}`,
      topic: `Topic ${i + 1}`,
    }));
    const r = buildThreadReentryList(threads);
    expect(r.kind).toBe('list');
    if (r.kind !== 'list') return;
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows).toHaveLength(10);
    expect(rows[rows.length - 1].id).toBe('thread_new');
  });

  it('single-thread buttons clips very long topic in body', () => {
    const longTopic = 'x'.repeat(2000);
    const r = buildSingleThreadButtons('Brand', longTopic);
    expect(r.kind).toBe('buttons');
    if (r.kind !== 'buttons') return;
    expect(r.body.length).toBeLessThanOrEqual(1024);
  });
});
