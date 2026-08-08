import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// The secret chain reads env at call time, so set one before importing.
beforeAll(() => {
  process.env.SESSION_COOKIE_SECRET = 'test-connect-secret';
});

afterEach(() => vi.useRealTimers());

const ACCOUNT = '11111111-2222-3333-4444-555555555555';

async function mod() {
  return import('@/lib/instagram-graph/connect-token');
}

describe('connect token', () => {
  it('round-trips the accountId', async () => {
    const { signConnectToken, verifyConnectToken } = await mod();
    const token = signConnectToken(ACCOUNT);
    expect(verifyConnectToken(token)).toEqual({ accountId: ACCOUNT });
  });

  it('does not expose the accountId in a guessable form', async () => {
    const { signConnectToken } = await mod();
    // The payload is base64url, not plaintext — a link cannot be hand-edited to
    // another accountId without invalidating the signature (covered below).
    expect(signConnectToken(ACCOUNT)).not.toContain(ACCOUNT);
  });

  it('rejects a token whose payload was swapped for another account', async () => {
    const { signConnectToken, verifyConnectToken } = await mod();
    const [, sig] = signConnectToken(ACCOUNT).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, a: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', e: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(verifyConnectToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const { signConnectToken } = await mod();
    const token = signConnectToken(ACCOUNT);

    vi.resetModules();
    process.env.SESSION_COOKIE_SECRET = 'a-completely-different-secret';
    const { verifyConnectToken } = await mod();
    expect(verifyConnectToken(token)).toBeNull();

    vi.resetModules();
    process.env.SESSION_COOKIE_SECRET = 'test-connect-secret';
  });

  it('rejects an expired token', async () => {
    const { signConnectToken, verifyConnectToken } = await mod();
    const token = signConnectToken(ACCOUNT, 1000);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2000);
    expect(verifyConnectToken(token)).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['no separator', 'abcdef'],
    ['empty signature', 'abcdef.'],
    ['garbage', 'not.a.token'],
  ])('rejects a %s token without throwing', async (_label, value) => {
    const { verifyConnectToken } = await mod();
    expect(verifyConnectToken(value as any)).toBeNull();
  });

  it('rejects a signature of the wrong length instead of throwing', async () => {
    // timingSafeEqual throws on mismatched buffer lengths — the length guard
    // must run first or every malformed link 500s.
    const { signConnectToken, verifyConnectToken } = await mod();
    const [payload] = signConnectToken(ACCOUNT).split('.');
    expect(() => verifyConnectToken(`${payload}.AAAA`)).not.toThrow();
    expect(verifyConnectToken(`${payload}.AAAA`)).toBeNull();
  });
});
