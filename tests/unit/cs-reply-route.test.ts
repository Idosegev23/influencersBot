import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sends are channel-scoped now; unit tests must not perform real channel resolution.
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  getBestieChannel: vi.fn(async () => ({
    id: 'ch-test', accountId: 'acc-test', wabaId: 'waba-test',
    phoneNumberId: 'PNID_TEST', displayPhoneNumber: '+972 54-390-2030',
    verifiedName: 'Bestie', token: 'TOK_TEST', status: 'active', paymentReady: true,
  })),
  resolveChannelByAccount: vi.fn(async () => null),
  resolveChannelByPhoneNumberId: vi.fn(async () => null),
  invalidateChannelCache: vi.fn(async () => {}),
}));


const sendText = vi.fn(async () => ({ success: true, wa_message_id: 'wamid.out.1' }));
const pauseBot = vi.fn();
const appendCsTicketHistory = vi.fn();
const loadCsSession = vi.fn();

vi.mock('@/lib/whatsapp-cloud/client', () => ({ sendText }));
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot, isBotPaused: vi.fn(), resumeBot: vi.fn() }));
vi.mock('@/lib/cs/cs-ticket', () => ({ appendCsTicketHistory, openOrAttachCsTicket: vi.fn() }));
vi.mock('@/lib/cs/cs-session', () => ({ loadCsSession }));
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: vi.fn(async () => null) }));

function req(body: any) {
  return new Request('http://x/api/cs/reply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

describe('POST /api/cs/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCsSession.mockResolvedValue({
      wa_id: '972501234567',
      active_account_id: 'a1',
      active_chat_session_id: 'cs1',
      active_ticket_id: 't1',
    });
  });

  it('400 on empty body', async () => {
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: '' }));
    expect(res.status).toBe(400);
  });

  it('404 when no active CS thread', async () => {
    loadCsSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'hi' }));
    expect(res.status).toBe(404);
  });

  it('sends the reply, pauses the bot as human_reply, and logs agent_message', async () => {
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'שלחנו לך שוב' }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: '972501234567', body: 'שלחנו לך שוב' }));
    expect(pauseBot).toHaveBeenCalledWith('cs1', 'human_reply');
    expect(appendCsTicketHistory).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 't1', action: 'agent_message', actor: 'bestie_inbox' }),
    );
  });

  it('401 when the caller is not an authenticated admin (no cross-account send)', async () => {
    const { requireAdminAuth } = await import('@/lib/auth/admin-auth');
    (requireAdminAuth as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'hi' }));
    expect(res.status).toBe(401);
    expect(loadCsSession).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(pauseBot).not.toHaveBeenCalled();
  });

  it('still pauses the bot and logs history (with a failure note) when the WhatsApp send fails', async () => {
    sendText.mockResolvedValueOnce({ success: false, error: { message: 'window_closed' } } as any);
    const { POST } = await import('@/app/api/cs/reply/route');
    const res = await POST(req({ waId: '972501234567', body: 'hi again' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('window_closed');
    expect(pauseBot).toHaveBeenCalledWith('cs1', 'human_reply');
    expect(appendCsTicketHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 't1',
        action: 'agent_message',
        actor: 'bestie_inbox',
        note: expect.stringContaining('window_closed'),
      }),
    );
  });
});
