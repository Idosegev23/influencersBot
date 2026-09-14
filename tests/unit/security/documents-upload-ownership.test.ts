/**
 * /api/influencer/documents/upload trusted `accountId` from the form body: a
 * valid session cookie for one username could upload files into, and create
 * partnership_documents rows for, any other account. The session's account
 * must now match the accountId (403 otherwise).
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

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(async () => null),
  checkPermission: vi.fn(async () => false),
  isAccountOwner: vi.fn(async () => false),
}));

const storageUpload = vi.fn(async () => ({ data: {}, error: null }));
const dbInsert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: storageUpload }) },
    from: () => ({
      insert: (row: any) => {
        dbInsert(row);
        return { select: () => ({ single: async () => ({ data: { id: 'doc-1' }, error: null }) }) };
      },
    }),
  },
  getInfluencerByUsername: vi.fn(async (u: string) => (u === 'alice' ? { id: 'acc-A', username: 'alice' } : null)),
}));

function formReq(fields: Record<string, string>, files = [{ name: 'a.pdf', size: 10, type: 'application/pdf' }]) {
  return {
    url: 'http://x/api/influencer/documents/upload',
    headers: new Headers(),
    formData: async () => ({
      get: (k: string) => (k in fields ? fields[k] : null),
      getAll: (k: string) => (k === 'files' ? files : []),
    }),
  } as any;
}

describe('POST /api/influencer/documents/upload — account ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValid = false;
    requireAdminAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  });

  it("rejects a logged-in influencer uploading into another account's accountId (403)", async () => {
    cookieValid = true;
    const { POST } = await import('@/app/api/influencer/documents/upload/route');
    const res = await POST(formReq({ username: 'alice', accountId: 'acc-B' }));
    expect(res.status).toBe(403);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('rejects a caller with no session at all (401)', async () => {
    const { POST } = await import('@/app/api/influencer/documents/upload/route');
    const res = await POST(formReq({ username: 'alice', accountId: 'acc-A' }));
    expect(res.status).toBe(401);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('still uploads for the logged-in owner of the account', async () => {
    cookieValid = true;
    const { POST } = await import('@/app/api/influencer/documents/upload/route');
    const res = await POST(formReq({ username: 'alice', accountId: 'acc-A' }));
    expect(res.status).toBe(200);
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(dbInsert).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-A' }));
  });

  it('still uploads for an admin session (the admin account page sends no username)', async () => {
    requireAdminAuth.mockResolvedValue(null);
    const { POST } = await import('@/app/api/influencer/documents/upload/route');
    const res = await POST(formReq({ accountId: 'acc-B' }));
    expect(res.status).toBe(200);
    expect(dbInsert).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-B' }));
  });
});
