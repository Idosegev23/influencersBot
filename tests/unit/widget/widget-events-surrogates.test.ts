import { describe, it, expect } from 'vitest';
import { normalizeWidgetEvents } from '@/lib/analytics/widget-events';

const ACC = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';
/**
 * Unpaired surrogates only. A well-formed emoji IS a surrogate pair, so a
 * naive /[\uD800-\uDFFF]/ flags valid text and would have failed the very
 * case we want to preserve.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Regression cover for the buffer blockage of 2026-08-19.
 *
 * A `click` event on a customer's /checkout captured the form's text and
 * truncated it at a fixed character count, slicing straight through an emoji's
 * surrogate pair. The orphaned half is legal JSON but not a legal Unicode
 * scalar, so PostgREST rejected the whole 500-row batch with PGRST102. The
 * drain leaves a failed batch in the buffer by design, so that one row blocked
 * the queue for six days, the list hit Upstash's 100 MiB per-key ceiling, and
 * every widget behavioural event was dropped on the floor after that.
 *
 * The producer is being fixed too, but `public/widget.js` sits in visitors'
 * browser caches for weeks. Sanitising at ingest is what makes this impossible
 * today rather than eventually.
 */
describe('normalizeWidgetEvents — unstorable text', () => {
  function normalize(payload: Record<string, unknown>, path = '/checkout') {
    return normalizeWidgetEvents(
      { anonId: 'aw_abcd', events: [{ type: 'click', uid: 'u1', path, payload, ts: Date.now() }] },
      ACC,
    );
  }

  it('strips the orphaned half of a surrogate pair left by a naive truncation', () => {
    const { rows, rejected } = normalize({ text: 'פרטי התקשרות \uD83D' });
    expect(rejected).toBe(0);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toMatch(LONE_SURROGATE);
    expect((rows[0].payload as Record<string, string>).text).toBe('פרטי התקשרות ');
  });

  it('leaves a well-formed emoji intact — the content is kept, only made storable', () => {
    const { rows } = normalize({ text: 'תודה רבה 😀' });
    expect((rows[0].payload as Record<string, string>).text).toBe('תודה רבה 😀');
  });

  it('reaches nested values, arrays, and object keys', () => {
    const { rows } = normalize({
      nested: { label: 'a\uDC00b', list: ['ok', '\uD83Dx'] },
      ['bad\uD800key']: 'v',
    });
    expect(JSON.stringify(rows[0])).not.toMatch(LONE_SURROGATE);
    const p = rows[0].payload as any;
    expect(p.nested.label).toBe('ab');
    expect(p.nested.list).toEqual(['ok', 'x']);
    expect(p.badkey).toBe('v');
  });

  it('sanitises the path and the event uid, not only the payload', () => {
    const { rows } = normalizeWidgetEvents(
      {
        anonId: 'aw_abcd',
        events: [{ type: 'click', uid: 'uid\uD83D', path: '/a\uDFFFb', payload: {}, ts: Date.now() }],
      },
      ACC,
    );
    expect(rows[0].path).toBe('/ab');
    expect(rows[0].event_uid).toBe('uid');
  });

  it('produces a row that survives a JSON round-trip as valid Unicode', () => {
    // The precise property Postgres requires: no unpaired surrogate anywhere.
    const { rows } = normalize({ text: 'x'.repeat(20) + '\uD83D' });
    const encoded = Buffer.from(JSON.stringify(rows[0]), 'utf8').toString('utf8');
    expect(encoded).not.toMatch(LONE_SURROGATE);
    expect(() => JSON.parse(encoded)).not.toThrow();
  });

  it('still enforces the 4KB payload cap after sanitising', () => {
    const { rows, rejected } = normalize({ text: 'x'.repeat(5000) });
    expect(rows).toHaveLength(0);
    expect(rejected).toBe(1);
  });
});
