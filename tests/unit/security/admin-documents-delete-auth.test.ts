/**
 * GET /api/admin/documents checked the admin cookie; DELETE on the same route
 * did not — anyone could delete any partnership document, its storage object
 * and its RAG chunks by id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const requireAdminAuth = vi.fn();
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth }));

const storageRemove = vi.fn(async () => ({ error: null }));
const rowDelete = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    storage: { from: () => ({ remove: storageRemove }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'doc-1', storage_path: 'acc/x.pdf', account_id: 'acc' }, error: null }),
          eq: async () => ({ data: [] }),
        }),
      }),
      delete: () => ({
        eq: async () => { rowDelete(table); return { error: null }; },
        in: async () => ({ error: null }),
      }),
    }),
  }),
}));

function req() {
  return new Request('http://x/api/admin/documents?documentId=doc-1', { method: 'DELETE' }) as any;
}

describe('DELETE /api/admin/documents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a caller without the admin session (401) and deletes nothing', async () => {
    requireAdminAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { DELETE } = await import('@/app/api/admin/documents/route');
    const res = await DELETE(req());
    expect(res.status).toBe(401);
    expect(storageRemove).not.toHaveBeenCalled();
    expect(rowDelete).not.toHaveBeenCalled();
  });

  it('still deletes for an admin', async () => {
    requireAdminAuth.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/admin/documents/route');
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(storageRemove).toHaveBeenCalledTimes(1);
    expect(rowDelete).toHaveBeenCalledWith('partnership_documents');
  });
});
