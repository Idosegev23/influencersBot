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

  it('surfaces Meta\'s error detail without leaking the secret or the code', async () => {
    // GET with query params is the form Meta documents for /oauth/access_token, so the secret
    // does travel in the URL — inside TLS, on a server-to-server call. What must NEVER escape
    // is the secret or the authorization code appearing in what we log or return.
    mockJson({ error: { message: 'This authorization code has expired.', code: 100, error_subcode: 36009, type: 'OAuthException' } }, false);
    await expect(exchangeEsCode('SECRET_CODE_VALUE')).rejects.toMatchObject({
      metaDetail: { code: 100, subcode: 36009, type: 'OAuthException' },
    });
    const detail = await exchangeEsCode('SECRET_CODE_VALUE').catch((e) => JSON.stringify(e.metaDetail));
    expect(detail).not.toContain('SECRET_CODE_VALUE');
    expect(detail).not.toContain('secret');
    expect(detail).toContain('expired');   // and it DOES carry the diagnosis
  });
});
