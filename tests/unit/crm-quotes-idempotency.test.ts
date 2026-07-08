import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny chainable stub that records inserts and can return a pre-seeded existing row.
const state: { existing: any; inserted: any[] } = { existing: null, inserted: [] };

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const chain: any = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: table === 'signature_requests' ? state.existing : null }),
      insert: (row: any) => {
        state.inserted.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { id: 'new-sig', token: row.token }, error: null }) }) };
      },
    };
    return chain;
  };
  return { supabase: { from, storage: { from: () => ({ upload: async () => ({ error: null }) }) } } };
});
// PDF generation needs fonts/fs (unavailable in the test env) — stub it.
vi.mock('@/lib/crm/pdf', () => ({
  generateQuotePdf: async () => new Uint8Array([1, 2, 3]),
  generateContractPdf: async () => new Uint8Array([1]),
  stampPdfWithSignature: async () => new Uint8Array([1]),
}));

import { issueQuote } from '@/lib/crm/quotes';

beforeEach(() => { state.existing = null; state.inserted = []; });

describe('issueQuote idempotency', () => {
  it('returns the existing signature and does NOT insert a second one', async () => {
    state.existing = { id: 'sig-1', token: 'tok-1', partnership_id: 'p1' };
    const res = await issueQuote('p1', { agentId: 'a', accountId: 'c', brandName: 'Coca' }, 'issue:p1');
    expect(res.signatureRequestId).toBe('sig-1');
    expect(res.token).toBe('tok-1');
    expect(res.signUrl).toContain('tok-1');
    expect(state.inserted.some((i) => i.table === 'signature_requests')).toBe(false);
  });

  it('inserts with the idempotency_key when none exists yet', async () => {
    state.existing = null;
    await issueQuote('p2', { agentId: 'a', accountId: 'c', brandName: 'Coca' }, 'issue:p2');
    const sigInsert = state.inserted.find((i) => i.table === 'signature_requests');
    expect(sigInsert?.row.idempotency_key).toBe('issue:p2');
  });
});
