import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows = new Map<string, any>();
const calls: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: async (row: any) => { calls.push(`upsert:${table}`); rows.set(row.address, row); return { error: null }; },
      select: () => ({
        in: async (_col: string, values: string[]) => ({
          data: values.map((v) => rows.get(v)).filter(Boolean),
          error: null,
        }),
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => ({ data: rows.get(value) || null, error: null }),
        }),
      }),
    }),
  },
}));

import { recordDeliverability, markBounced, getDeliverability } from '@/lib/support/email-deliverability-store';

beforeEach(() => { rows.clear(); calls.length = 0; });

describe('recordDeliverability', () => {
  it('stores a dead address under its normalized form', async () => {
    await recordDeliverability('  LiliLevy42@Gmail.com.IL ', 'no_mx', 'nxdomain');
    expect(rows.get('lililevy42@gmail.com.il')).toMatchObject({ status: 'no_mx', reason: 'nxdomain' });
  });

  it('stores a good address as ok — the table is not a deny-list', async () => {
    // Companion presence assertion: without this, a store that silently dropped every
    // write except failures would still pass the test above.
    await recordDeliverability('nurse@clalit.org.il', 'ok');
    expect(rows.get('nurse@clalit.org.il')).toMatchObject({ status: 'ok' });
  });

  it('writes nothing for an unusable value', async () => {
    await recordDeliverability('לא רוצה', 'no_mx');
    expect(calls).toHaveLength(0);
  });
});

describe('markBounced', () => {
  it('records the bounce with a count and a timestamp', async () => {
    await markBounced('lililevy42@gmail.com.il', 'Address not found');
    const row = rows.get('lililevy42@gmail.com.il');
    expect(row).toMatchObject({ status: 'bounced', reason: 'Address not found', bounce_count: 1 });
    expect(row.last_bounce_at).toBeTruthy();
  });

  it('increments the count on a second bounce rather than resetting it', async () => {
    await markBounced('lililevy42@gmail.com.il', 'Address not found');
    await markBounced('lililevy42@gmail.com.il', 'Address not found');
    expect(rows.get('lililevy42@gmail.com.il')).toMatchObject({ bounce_count: 2 });
  });
});

describe('getDeliverability', () => {
  it('returns only the addresses it knows about, keyed normalized', async () => {
    await recordDeliverability('lililevy42@gmail.com.il', 'no_mx');
    const map = await getDeliverability(['LiliLevy42@gmail.com.il', 'someone@gmail.com']);
    expect(map.get('lililevy42@gmail.com.il')).toBe('no_mx');
    expect(map.has('someone@gmail.com')).toBe(false);
  });

  it('returns an empty map for an empty input without querying', async () => {
    expect((await getDeliverability([])).size).toBe(0);
  });
});
