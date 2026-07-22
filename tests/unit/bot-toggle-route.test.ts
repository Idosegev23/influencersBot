import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

const pauseBot = vi.fn();
const resumeBot = vi.fn();
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot, resumeBot, isBotPaused: vi.fn() }));
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: vi.fn(async () => null) })); // null === admin OK
vi.mock('@/lib/auth/influencer-auth', () => ({ checkInfluencerAuth: vi.fn(async () => false) }));

const supabaseFrom = vi.fn((t: string) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () =>
        t === 'chat_sessions'
          ? { data: { id: 'cs1', account_id: 'a1' } }
          : { data: { config: { username: 'argania' } } },
    }),
  }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: supabaseFrom },
  getInfluencerByUsername: vi.fn(),
}));

function req(body: any) {
  return new Request('http://x/api/influencer/conversations/bot-toggle', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

describe('POST /api/influencer/conversations/bot-toggle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a bad action with 400', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the chat session does not exist (no cross-account guess is possible)', async () => {
    supabaseFrom.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }));
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'does-not-exist', action: 'pause' }));
    expect(res.status).toBe(404);
    expect(pauseBot).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated / non-owner caller with 401 (no bot toggle happens)', async () => {
    // Neither admin nor the owning influencer (checkInfluencerAuth already defaults to false above).
    vi.mocked(requireAdminAuth).mockResolvedValueOnce({ status: 401 } as any);
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'pause' }));
    expect(res.status).toBe(401);
    expect(pauseBot).not.toHaveBeenCalled();
  });

  it('pauses when action=pause', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'pause' }));
    expect(res.status).toBe(200);
    expect(pauseBot).toHaveBeenCalledWith('cs1', 'manual');
  });

  it('resumes when action=resume', async () => {
    const { POST } = await import('@/app/api/influencer/conversations/bot-toggle/route');
    const res = await POST(req({ chatSessionId: 'cs1', action: 'resume' }));
    expect(res.status).toBe(200);
    expect(resumeBot).toHaveBeenCalledWith('cs1');
  });
});
