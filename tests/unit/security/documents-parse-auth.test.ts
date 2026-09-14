/**
 * /api/influencer/documents/parse used to run paid multi-layer AI parsing on
 * ANY document id, for ANY caller, with no session at all. It must now require
 * the account's own session (or admin) and refuse documents of another account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const parseDocument = vi.fn(async () => ({
  success: false,
  data: null,
  confidence: 0,
  model: 'none',
  attemptNumber: 1,
  error: 'stub',
}));
vi.mock('@/lib/ai-parser', () => ({
  parseDocument,
  mergeDocuments: vi.fn(() => ({ confidence: 0 })),
}));

const requireAdminAuth = vi.fn(async () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth }));

const requireInfluencerAuth = vi.fn();
vi.mock('@/lib/auth/influencer-auth', () => ({ requireInfluencerAuth }));

let docs: any[] = [];
const updates: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: async () => ({ data: docs, error: null }) }),
      update: (v: any) => ({ eq: async () => { updates.push(v); return { error: null }; } }),
      insert: async () => ({ error: null }),
    }),
    storage: {
      from: () => ({ download: async () => ({ data: new Blob(['hello']), error: null }) }),
    },
  },
}));

const DOC_A = { id: 'doc-a', account_id: 'acc-A', filename: 'a.pdf', mime_type: 'application/pdf', storage_path: 'acc-A/documents/a.pdf', document_type: 'contract' };
const DOC_B = { id: 'doc-b', account_id: 'acc-B', filename: 'b.pdf', mime_type: 'application/pdf', storage_path: 'acc-B/documents/b.pdf', document_type: 'contract' };

function req(body: any, username?: string) {
  const url = `http://x/api/influencer/documents/parse${username ? `?username=${username}` : ''}`;
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

function asOwnerOf(accountId: string) {
  requireInfluencerAuth.mockResolvedValue({ authorized: true, username: 'alice', influencer: { id: accountId }, accountId, response: null });
}
function unauthenticated() {
  requireInfluencerAuth.mockResolvedValue({ authorized: false, username: null, influencer: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
}

describe('POST /api/influencer/documents/parse — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    requireAdminAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  });

  it('rejects a caller with no session (401) and never parses', async () => {
    unauthenticated();
    docs = [DOC_A];
    const { POST } = await import('@/app/api/influencer/documents/parse/route');
    const res = await POST(req({ documentId: 'doc-a' }));
    expect(res.status).toBe(401);
    expect(parseDocument).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("rejects a logged-in owner asking to parse another account's document (403)", async () => {
    asOwnerOf('acc-A');
    docs = [DOC_B];
    const { POST } = await import('@/app/api/influencer/documents/parse/route');
    const res = await POST(req({ documentId: 'doc-b' }, 'alice'));
    expect(res.status).toBe(403);
    expect(parseDocument).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('rejects a batch that mixes an own document with a foreign one (403)', async () => {
    asOwnerOf('acc-A');
    docs = [DOC_A, DOC_B];
    const { POST } = await import('@/app/api/influencer/documents/parse/route');
    const res = await POST(req({ documentIds: ['doc-a', 'doc-b'] }, 'alice'));
    expect(res.status).toBe(403);
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it('still parses for the legitimate owner of the document', async () => {
    asOwnerOf('acc-A');
    docs = [DOC_A];
    const { POST } = await import('@/app/api/influencer/documents/parse/route');
    const res = await POST(req({ documentId: 'doc-a' }, 'alice'));
    expect(res.status).toBe(200);
    expect(parseDocument).toHaveBeenCalledTimes(1);
  });

  it('still parses for an admin session, on any account', async () => {
    requireAdminAuth.mockResolvedValue(null as any);
    docs = [DOC_B];
    const { POST } = await import('@/app/api/influencer/documents/parse/route');
    const res = await POST(req({ documentId: 'doc-b' }));
    expect(res.status).toBe(200);
    expect(parseDocument).toHaveBeenCalledTimes(1);
    expect(requireInfluencerAuth).not.toHaveBeenCalled();
  });
});
