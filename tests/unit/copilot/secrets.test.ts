import { describe, it, expect, vi, beforeEach } from 'vitest';

let accountRead: { data: any; error: any } = { data: null, error: null };
let rpcResult: { data: any; error: any } = { data: null, error: null };
const rpcCalls: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => accountRead }) }) }),
    rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return rpcResult; },
  },
}));

import { getIdentifySecret } from '@/lib/copilot/secrets';

beforeEach(() => { accountRead = { data: null, error: null }; rpcResult = { data: null, error: null }; rpcCalls.length = 0; });

describe('getIdentifySecret', () => {
  it('reads the secret through the vault RPC', async () => {
    accountRead = { data: { config: { copilot: { identify_secret_ref: 'sec-1' } } }, error: null };
    rpcResult = { data: 's3cret', error: null };
    expect(await getIdentifySecret('acc')).toBe('s3cret');
    expect(rpcCalls).toEqual([{ name: 'copilot_read_secret', args: { p_secret_id: 'sec-1' } }]);
  });

  it('returns null when the association has no secret configured', async () => {
    accountRead = { data: { config: {} }, error: null };
    expect(await getIdentifySecret('acc')).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });

  it('throws on an accounts read error instead of reporting "not configured"', async () => {
    accountRead = { data: null, error: { message: 'connection refused' } };
    await expect(getIdentifySecret('acc')).rejects.toThrow(/connection refused/);
    expect(rpcCalls).toHaveLength(0);
  });
});
