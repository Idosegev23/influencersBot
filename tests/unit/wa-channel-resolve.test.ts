import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: any[]) => from(...a) } }));

const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
vi.mock('@/lib/redis', () => ({
  redisGet: (...a: any[]) => redisGet(...a),
  redisSet: (...a: any[]) => redisSet(...a),
  redisDel: (...a: any[]) => redisDel(...a),
}));

vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({
  readToken: vi.fn(async () => 'EAAG-decrypted'),
}));

import {
  resolveChannelByAccount,
  resolveChannelByPhoneNumberId,
} from '@/lib/whatsapp-cloud/channels';

const ROW = {
  id: 'ch-1', account_id: 'acc-1', waba_id: '1458477285751402',
  phone_number_id: '1056971817508262', display_phone_number: '+972 54-390-2030',
  verified_name: 'Bestie', token_secret_id: 'sec-1', status: 'active', payment_ready: true,
};

beforeEach(() => {
  [maybeSingle, eq, select, from, redisGet, redisSet, redisDel].forEach((m) => m.mockClear());
  redisGet.mockResolvedValue(null);
  redisSet.mockResolvedValue(true);
});

describe('channel resolution', () => {
  it('resolves by account and decrypts the token', async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    const ch = await resolveChannelByAccount('acc-1');
    expect(ch.phoneNumberId).toBe('1056971817508262');
    expect(ch.token).toBe('EAAG-decrypted');
  });

  it('THROWS when an account has no channel — never falls back to env', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveChannelByAccount('acc-none')).rejects.toThrow(/no WhatsApp channel/i);
  });

  it('returns null for an unknown phone_number_id (webhook must still 200)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveChannelByPhoneNumberId('999')).resolves.toBeNull();
  });

  it('never caches the decrypted token — cache payload has no token field', async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    await resolveChannelByPhoneNumberId('1056971817508262');
    const cached = JSON.parse(redisSet.mock.calls[0][1]);
    expect(cached.token).toBeUndefined();
    expect(cached.token_secret_id).toBeUndefined();
  });

  it('a disconnected channel does not resolve', async () => {
    maybeSingle.mockResolvedValue({ data: { ...ROW, status: 'disconnected' }, error: null });
    await expect(resolveChannelByPhoneNumberId('1056971817508262')).resolves.toBeNull();
  });
});
