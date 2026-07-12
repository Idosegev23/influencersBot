import { describe, it, expect, vi, afterEach } from 'vitest';
import { callGraph } from '@/lib/meta-review/graph';

afterEach(() => vi.restoreAllMocks());

describe('callGraph', () => {
  it('redacts the token in request.url and never leaks it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: '123', username: 'ldrs' }), { status: 200 })));
    const r = await callGraph({
      method: 'GET',
      url: 'https://graph.instagram.com/v22.0/me?fields=id',
      accessToken: 'SUPERSECRET',
    });
    expect(r.ok).toBe(true);
    expect(r.request.url).toContain('access_token=***REDACTED***');
    expect(r.request.url).not.toContain('SUPERSECRET');
    expect((r.response as any).username).toBe('ldrs');
  });

  it('returns the Graph error body with ok:false instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad', code: 100 } }), { status: 400 })));
    const r = await callGraph({
      method: 'GET',
      url: 'https://graph.instagram.com/v22.0/me',
      accessToken: 'X',
    });
    expect(r.ok).toBe(false);
    expect((r.response as any).error.code).toBe(100);
  });
});
