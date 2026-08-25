import { describe, it, expect, vi } from 'vitest';
import { drainBatch } from '@/lib/analytics/drain-batch';

/**
 * The drain used to `break` on an insert error and leave the batch in the
 * buffer, so that nothing was ever lost. On 2026-08-19 one row Postgres could
 * not store made that guarantee eat itself: the batch was retried every minute
 * for six days, nothing drained, the Redis list hit Upstash's 100 MiB per-key
 * ceiling, and from that point every widget event was dropped on the floor.
 *
 * The invariant these tests pin: the queue always advances. A row that cannot
 * be stored is set aside, and the ones behind it get through.
 */
const row = (id: number) => ({ account_id: 'a', event_uid: `u${id}`, type: 'click', created_at: 'now' });

/** An insert that rejects any batch containing a row the caller marked poison. */
function insertRejecting(poison: Set<number>) {
  return vi.fn(async (rows: any[]) => {
    const bad = rows.find((r) => poison.has(Number(String(r.event_uid).slice(1))));
    return bad ? { ok: false as const, error: 'PGRST102 Empty or invalid json' } : { ok: true as const };
  });
}

describe('drainBatch', () => {
  it('inserts a clean batch in one call and quarantines nothing', async () => {
    const insert = insertRejecting(new Set());
    const res = await drainBatch([row(1), row(2), row(3)], insert);
    expect(res).toMatchObject({ inserted: 3, quarantined: [] });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('isolates the one unstorable row and still inserts the other 499', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    const insert = insertRejecting(new Set([190]));
    const res = await drainBatch(rows, insert);
    expect(res.inserted).toBe(499);
    expect(res.quarantined).toHaveLength(1);
    expect(res.quarantined[0].row.event_uid).toBe('u190');
    expect(res.quarantined[0].reason).toContain('PGRST102');
  });

  it('bisects rather than retrying row by row — a 500-row batch costs far fewer calls', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    const insert = insertRejecting(new Set([190]));
    await drainBatch(rows, insert);
    // Row-by-row would be 501. Bisection is ~2*log2(500) plus the halves.
    expect(insert.mock.calls.length).toBeLessThan(60);
  });

  it('handles several poison rows in one batch', async () => {
    const rows = Array.from({ length: 64 }, (_, i) => row(i));
    const res = await drainBatch(rows, insertRejecting(new Set([0, 31, 63])));
    expect(res.inserted).toBe(61);
    expect(res.quarantined.map((q) => q.row.event_uid).sort()).toEqual(['u0', 'u31', 'u63']);
  });

  it('never loses a row: every input is either inserted or quarantined', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(i));
    const res = await drainBatch(rows, insertRejecting(new Set([7, 8, 9])));
    expect(res.inserted + res.quarantined.length).toBe(rows.length);
  });

  it('quarantines the whole batch when every row is unstorable rather than looping', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => row(i));
    const res = await drainBatch(rows, insertRejecting(new Set([0, 1, 2, 3])));
    expect(res.inserted).toBe(0);
    expect(res.quarantined).toHaveLength(4);
  });

  it('returns immediately for an empty batch', async () => {
    const insert = insertRejecting(new Set());
    const res = await drainBatch([], insert);
    expect(res).toMatchObject({ inserted: 0, quarantined: [] });
    expect(insert).not.toHaveBeenCalled();
  });
});
