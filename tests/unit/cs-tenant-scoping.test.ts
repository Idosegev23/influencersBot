import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: registry.ts imports ./index, so index.ts is loaded before any doMock could run.
const eq = vi.fn();
const chain: any = {
  select: () => chain, in: () => chain, eq: (...a: any[]) => { eq(...a); return chain; },
  order: () => chain, limit: async () => ({ data: [] }),
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => chain } }));

import { buildCsToolset } from '@/lib/cs/tools/registry';
import { openCsThreads } from '@/lib/cs/tools/index';

beforeEach(() => eq.mockClear());

const ACCOUNT = { archetype: 'brand', config: { integrations: {} } };

function names(opts: any) {
  return buildCsToolset(opts).defs.map((d) => d.function.name);
}

describe('a pre-bound customer channel cannot reach across tenants', () => {
  it('drops resolve_brand and bind_brand even though the medium is whatsapp', () => {
    const n = names({ channel: 'whatsapp', account: ACCOUNT, preBoundAccountId: 'acc-customer' });
    expect(n).not.toContain('resolve_brand');
    expect(n).not.toContain('bind_brand');
  });

  it('Bestie’s shared number keeps them — that is the whole point of the shared number', () => {
    const n = names({ channel: 'whatsapp', account: null, preBoundAccountId: null });
    expect(n).toContain('resolve_brand');
    expect(n).toContain('bind_brand');
  });

  it('a brand bound mid-conversation on the shared number still keeps them', () => {
    // Binding by conversation is NOT the same as the number deciding the tenant.
    const n = names({ channel: 'whatsapp', account: ACCOUNT, preBoundAccountId: null });
    expect(n).toContain('bind_brand');
  });

  it('non-whatsapp media are unchanged', () => {
    const n = names({ channel: 'widget', account: ACCOUNT });
    expect(n).not.toContain('resolve_brand');
    expect(n).not.toContain('bind_brand');
  });
});

describe('openCsThreads is scoped when the number decides the tenant', () => {
  it('filters by account_id when a pre-bound account is supplied', async () => {
    await openCsThreads('972500000000', 'acc-customer');
    expect(eq).toHaveBeenCalledWith('account_id', 'acc-customer');
  });

  it('does NOT filter on the shared number — cross-brand re-entry is the feature there', async () => {
    await openCsThreads('972500000000', null);
    expect(eq).not.toHaveBeenCalledWith('account_id', expect.anything());
  });
});
