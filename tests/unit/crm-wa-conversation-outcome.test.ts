import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const chain: any = {
    select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: null }), upsert: async () => ({ data: null, error: null }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }), update: () => chain,
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/lib/crm/quote-ingest', () => ({ ingestQuote: async () => ({ ok: true, matched: false }) }));
vi.mock('@/lib/openai', () => ({ chat: async () => { throw new Error('planner down'); }, CHAT_MODEL: 'gpt-5-nano' }));

import { handleAgentMessage } from '@/lib/crm/wa-conversation';

beforeEach(() => vi.clearAllMocks());

describe('handleAgentMessage outcome contract', () => {
  it('empty voice → error, ask to resend (never documents a brief)', async () => {
    const res = await handleAgentMessage({ id: 'a', managed_account_ids: [] } as any, '972500000000', null, [], { isVoice: true });
    expect(res.outcome).toBe('error');
    expect(res.reply).toMatch(/לשלוח שוב|שוב/);
  });
  it('planner failure → error + resend, NOT a junk brief, NOT ✅', async () => {
    const res = await handleAgentMessage({ id: 'a', managed_account_ids: [] } as any, '972500000000', 'משהו חופשי', []);
    expect(res.outcome).toBe('error');
    expect(res.reply).toBeTruthy();
  });
});
