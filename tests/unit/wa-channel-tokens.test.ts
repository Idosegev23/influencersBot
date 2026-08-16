import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));

import { storeToken, readToken, deleteToken } from '@/lib/whatsapp-cloud/channel-tokens';

beforeEach(() => rpc.mockReset());

describe('channel token vault wrappers', () => {
  it('storeToken returns the new secret id', async () => {
    rpc.mockResolvedValue({ data: 'a3f1e2d4-0000-4000-8000-000000000001', error: null });
    await expect(storeToken('EAAG...')).resolves.toBe('a3f1e2d4-0000-4000-8000-000000000001');
    expect(rpc).toHaveBeenCalledWith('wa_channel_store_token', { p_token: 'EAAG...' });
  });

  it('storeToken throws on an RPC error rather than returning undefined', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(storeToken('EAAG...')).rejects.toThrow(/permission denied/);
  });

  it('readToken throws when the secret is missing — never returns empty', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(readToken('a3f1e2d4-0000-4000-8000-000000000001')).rejects.toThrow(/not found/i);
  });

  it('deleteToken is a no-op for a null secret id', async () => {
    await deleteToken(null as unknown as string);
    expect(rpc).not.toHaveBeenCalled();
  });
});
