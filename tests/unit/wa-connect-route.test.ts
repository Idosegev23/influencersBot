import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertWabaOwnership, exchangeEsCode } from '@/lib/whatsapp-cloud/provisioning';

function mockJson(payload: any, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok, status: ok ? 200 : 400,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_FB_APP_ID = '1297141655644794';
  process.env.WHATSAPP_APP_SECRET = 'secret';
});

describe('WABA ownership is proved by Meta, not claimed by the browser', () => {
  it('accepts a waba_id present in granular_scopes.target_ids', async () => {
    mockJson({ data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['1458477285751402'] }] } });
    await expect(assertWabaOwnership('TOK', '1458477285751402')).resolves.toBeUndefined();
  });

  it('THROWS for a waba_id the token does not cover', async () => {
    mockJson({ data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['1458477285751402'] }] } });
    await expect(assertWabaOwnership('TOK', '9999999999')).rejects.toThrow(/does not grant access/i);
  });

  it('THROWS when granular_scopes is absent entirely — absence is not permission', async () => {
    mockJson({ data: {} });
    await expect(assertWabaOwnership('TOK', '1458477285751402')).rejects.toThrow(/does not grant access/i);
  });

  it('THROWS when debug_token itself fails — never fall open', async () => {
    mockJson({ error: { message: 'bad token' } }, false);
    await expect(assertWabaOwnership('TOK', '1458477285751402')).rejects.toThrow();
  });
});

describe('ES code exchange', () => {
  it('returns the access token', async () => {
    mockJson({ access_token: 'EAAG-business-integration' });
    await expect(exchangeEsCode('CODE')).resolves.toBe('EAAG-business-integration');
  });

  it('THROWS when Meta returns no token', async () => {
    mockJson({ error: { message: 'code expired' } }, false);
    await expect(exchangeEsCode('CODE')).rejects.toThrow(/exchange failed/i);
  });

  it('reports every attempted variant without leaking the secret or the code', async () => {
    // The exchange tries several request shapes because Meta's rejection message is identical
    // for a malformed code and a wrong secret, so it tells us nothing on its own. Each attempt
    // is reported; none of them may carry the secret or the authorization code.
    mockJson({ error: { message: 'This authorization code has expired.', code: 100, error_subcode: 36009, type: 'OAuthException' } }, false);
    const err: any = await exchangeEsCode('SECRET_CODE_VALUE', 'https://bestie.ldrsgroup.com/onboard/abc').catch((e) => e);

    expect(Array.isArray(err.metaDetail)).toBe(true);
    expect(err.metaDetail.map((f: any) => f.attempt))
      .toEqual(['plain', 'grant_type', 'redirect_uri', 'redirect_uri+grant_type']);
    expect(err.metaDetail[0]).toMatchObject({ code: 100, subcode: 36009, type: 'OAuthException' });

    const dump = JSON.stringify(err.metaDetail);
    expect(dump).not.toContain('SECRET_CODE_VALUE');
    expect(dump).not.toContain('secret');
    expect(dump).toContain('expired');   // and it DOES carry the diagnosis
  });

  it('returns the token from whichever variant Meta accepts', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++;
      return n === 1
        ? { ok: false, status: 400, json: async () => ({ error: { message: 'nope', code: 100 } }), text: async () => '' }
        : { ok: true, status: 200, json: async () => ({ access_token: 'EAAG-from-variant-2' }), text: async () => '' };
    }));
    await expect(exchangeEsCode('CODE')).resolves.toBe('EAAG-from-variant-2');
  });
});
