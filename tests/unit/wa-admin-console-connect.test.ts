import { describe, it, expect, vi, beforeEach } from 'vitest';

// The admin console is a third door into the same connect flow. What it must guarantee:
// only an admin agent gets through, and the account is the one in their signed session —
// never anything the browser sent.

let session: any;
vi.mock('@/lib/auth/agent-auth', () => ({ getAgentSession: vi.fn(async () => session) }));

let channelRow: any;
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: channelRow }) }) }) }) },
}));

const connectCalls: any[] = [];
vi.mock('@/lib/whatsapp-cloud/provisioning', () => ({
  exchangeEsCode: vi.fn(async () => 'TOK'),
  assertWabaOwnership: vi.fn(async () => {}),
  resolvePhoneNumberId: vi.fn(async () => 'PNID'),
  runProvisioningChain: vi.fn(async (args: any) => { connectCalls.push(args); return { ok: true, channelId: 'ch-1', state: {} }; }),
}));
vi.mock('@/lib/whatsapp-cloud/billing-probe', () => ({ runBillingProbe: vi.fn(async () => ({ paymentReady: true })) }));

const ADMIN = { agent_id: 'ag-1', account_id: 'acc-real', is_admin: true, account_username: 'labeaute.israel' };

function post(body: any) {
  return new Request('https://x/api/agent/account/labeaute.israel/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any;
}
const ctx = { params: Promise.resolve({ username: 'labeaute.israel' }) };

beforeEach(() => {
  connectCalls.length = 0;
  session = ADMIN;
  channelRow = null;
});

describe('admin console WhatsApp connect', () => {
  it('connects the account from the admin session, ignoring any account id in the body', async () => {
    const { POST } = await import('@/app/api/agent/account/[username]/whatsapp/route');
    const res = await POST(post({ code: 'C', waba_id: 'W', account_id: 'acc-attacker', accountId: 'acc-attacker' }), ctx);

    expect(res.status).toBe(200);
    expect(connectCalls).toHaveLength(1);
    expect(connectCalls[0]).toMatchObject({ accountId: 'acc-real', wabaId: 'W', phoneNumberId: 'PNID' });
  });

  it('rejects a non-admin agent with 403 and connects nothing', async () => {
    session = { ...ADMIN, is_admin: false };
    const { POST } = await import('@/app/api/agent/account/[username]/whatsapp/route');
    const res = await POST(post({ code: 'C', waba_id: 'W' }), ctx);
    expect(res.status).toBe(403);
    expect(connectCalls).toHaveLength(0);
  });

  it('rejects a request with no agent session with 401 and connects nothing', async () => {
    session = null;
    const { POST } = await import('@/app/api/agent/account/[username]/whatsapp/route');
    const res = await POST(post({ code: 'C', waba_id: 'W' }), ctx);
    expect(res.status).toBe(401);
    expect(connectCalls).toHaveLength(0);
  });
});

describe('channel status the card opens on', () => {
  it('404 when the account has no channel', async () => {
    const { channelStatus } = await import('@/lib/whatsapp-cloud/connect-account');
    expect((await channelStatus('acc-real')).status).toBe(404);
  });

  it('treats a disconnected channel as none, so the connect button comes back', async () => {
    channelRow = { id: 'ch-1', status: 'disconnected', onboarding_mode: 'coexistence', sync_initiated_at: null };
    const { channelStatus } = await import('@/lib/whatsapp-cloud/connect-account');
    expect((await channelStatus('acc-real')).status).toBe(404);
  });

  it('flags a Coexistence channel whose sync never started', async () => {
    channelRow = { id: 'ch-1', waba_id: 'W', status: 'pending', onboarding_mode: 'coexistence', sync_initiated_at: null, templates: {} };
    const { channelStatus } = await import('@/lib/whatsapp-cloud/connect-account');
    const out = await channelStatus('acc-real');
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ wabaId: 'W', syncMissing: true });
  });

  it('does not flag a channel whose sync started', async () => {
    channelRow = { id: 'ch-1', waba_id: 'W', status: 'active', onboarding_mode: 'coexistence', sync_initiated_at: '2026-10-11T10:00:00Z', templates: {} };
    const { channelStatus } = await import('@/lib/whatsapp-cloud/connect-account');
    const out = await channelStatus('acc-real');
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ wabaId: 'W', syncMissing: false });
  });
});
