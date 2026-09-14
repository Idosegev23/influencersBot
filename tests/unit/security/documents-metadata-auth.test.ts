/**
 * /api/influencer/documents/metadata accepted anonymous callers as long as the
 * username matched the accountId (both public), then fired a server-side parse
 * — which the upload UI also fires, so every upload was parsed twice.
 * Now: session required, accountId and storagePath bound to that account, and
 * this route no longer triggers parse (the UI's single call is the trigger).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

let cookieValid = false;
vi.mock('@/lib/auth/session-token', () => ({
  verifySessionToken: vi.fn(() => cookieValid),
  influencerSubject: (u: string) => `influencer:${u}`,
}));
vi.mock('@/lib/auth/influencer-auth', () => ({
  checkInfluencerAuth: vi.fn(async () => cookieValid),
}));

const requireAdminAuth = vi.fn();
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth }));

const dbInsert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: any) => {
        dbInsert(row);
        return { select: () => ({ single: async () => ({ data: { id: 'doc-1', ...row }, error: null }) }) };
      },
    }),
  },
  getInfluencerByUsername: vi.fn(async (u: string) =>
    u === 'alice' ? { id: 'acc-A', username: 'alice' } : u === 'bob' ? { id: 'acc-B', username: 'bob' } : null,
  ),
}));

function req(body: any) {
  return new Request('http://x/api/influencer/documents/metadata', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

const base = { filename: 'a.pdf', fileSize: 10, mimeType: 'application/pdf', documentType: 'contract' };

describe('POST /api/influencer/documents/metadata — auth + single parse trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValid = false;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
    (global.fetch as any) = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    requireAdminAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  });

  it('rejects an anonymous caller even when username and accountId match (401)', async () => {
    const { POST } = await import('@/app/api/influencer/documents/metadata/route');
    const res = await POST(req({ ...base, username: 'bob', accountId: 'acc-B', storagePath: 'acc-B/documents/a.pdf' }));
    expect(res.status).toBe(401);
    expect(dbInsert).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a logged-in influencer registering a document on another account (403)", async () => {
    cookieValid = true;
    const { POST } = await import('@/app/api/influencer/documents/metadata/route');
    const res = await POST(req({ ...base, username: 'alice', accountId: 'acc-B', storagePath: 'acc-B/documents/a.pdf' }));
    expect(res.status).toBe(403);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("rejects an owner pointing storagePath into another account's folder (403)", async () => {
    cookieValid = true;
    const { POST } = await import('@/app/api/influencer/documents/metadata/route');
    const res = await POST(req({ ...base, username: 'alice', accountId: 'acc-A', storagePath: 'acc-B/signed/contract.pdf' }));
    expect(res.status).toBe(403);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('still saves for the logged-in owner, and does not fire a second parse', async () => {
    cookieValid = true;
    const { POST } = await import('@/app/api/influencer/documents/metadata/route');
    const res = await POST(req({ ...base, username: 'alice', accountId: 'acc-A', storagePath: 'acc-A/documents/a.pdf' }));
    expect(res.status).toBe(200);
    expect(dbInsert).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-A', storage_path: 'acc-A/documents/a.pdf' }));
    const parseCalls = (global.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/documents/parse'));
    expect(parseCalls).toHaveLength(0);
  });
});
