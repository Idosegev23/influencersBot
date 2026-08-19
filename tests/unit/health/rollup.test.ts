import { describe, it, expect, vi, beforeEach } from 'vitest';

// R8: the brief's snippet declares these mocks as top-level `const`s referenced
// from the vi.mock factory below. Vitest hoists vi.mock factories above normal
// top-level const declarations, so that throws a ReferenceError at import time
// regardless of implementation. vi.hoisted() lifts the mock declarations
// themselves above the hoisted factory so they're defined when the factory runs.
const { rpcMock, upsertMock, contractsMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({ error: null }),
  contractsMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => rpcMock(...a),
    from: (table: string) => table === 'account_contracts'
      ? { select: () => ({ eq: contractsMock }) }
      : { upsert: upsertMock },
  },
}));

import { rollupAccountHealth } from '@/lib/health/rollup';

describe('rollupAccountHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ error: null });
    contractsMock.mockResolvedValue({
      data: [{ account_id: 'acc-1', expected_channels: ['widget', 'whatsapp'] }],
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: { widget: { everPinged: true, hoursSinceLastPing: 2, opensLast7d: 5, errorsLast24h: 0, loadsLast24h: 100 },
              whatsapp: { everPinged: false, hoursSinceLastPing: null, opensLast7d: 0, errorsLast24h: 0, loadsLast24h: 0 } },
      error: null,
    });
  });

  it('writes one row per expected channel, not one per account', async () => {
    const r = await rollupAccountHealth('2026-08-19');
    expect(r).toEqual({ accounts: 1, rows: 2 });
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.map((x: any) => x.channel).sort()).toEqual(['whatsapp', 'widget']);
  });

  it('derives a different status per channel for the same account', async () => {
    await rollupAccountHealth('2026-08-19');
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.find((x: any) => x.channel === 'widget').status).toBe('live');
    expect(rows.find((x: any) => x.channel === 'whatsapp').status).toBe('never_installed');
  });

  it('ignores channels that were never sold', async () => {
    await rollupAccountHealth('2026-08-19');
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.some((x: any) => x.channel === 'instagram')).toBe(false);
  });

  it('skips accounts with no contract row entirely', async () => {
    contractsMock.mockResolvedValue({ data: [], error: null });
    const r = await rollupAccountHealth('2026-08-19');
    expect(r).toEqual({ accounts: 0, rows: 0 });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('upserts on the composite key so a re-run is idempotent', async () => {
    await rollupAccountHealth('2026-08-19');
    expect(upsertMock.mock.calls[0][1]).toEqual({ onConflict: 'account_id,date,channel' });
  });
});
