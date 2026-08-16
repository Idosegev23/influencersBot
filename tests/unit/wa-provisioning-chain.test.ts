import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];

vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({
  storeToken: vi.fn(async () => { calls.push('vault'); return 'sec-1'; }),
  deleteToken: vi.fn(async () => {}),
}));

vi.mock('@/lib/whatsapp-cloud/cs-templates', () => ({
  createCsTemplates: vi.fn(async () => { calls.push('templates'); return templatesOk; }),
}));

vi.mock('@/lib/whatsapp-notify', () => ({ sendSupportFreeformMessage: vi.fn(async () => ({ success: true })) }));

let templatesOk = true;
const updated: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: { id: 'ch-new' }, error: null }) }) }),
      update: (patch: any) => { updated.push(patch); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));

function mockFetch(failOn: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    const kind = u.includes('subscribed_apps') ? 'subscribe' : u.includes('smb_app_data') ? 'sync' : 'other';
    calls.push(kind);
    const ok = !failOn.includes(kind);
    return { ok, status: ok ? 200 : 400, json: async () => ({ success: ok }), text: async () => '' };
  }));
}

beforeEach(() => { calls.length = 0; updated.length = 0; templatesOk = true; vi.unstubAllGlobals(); });

const ARGS = { accountId: 'acc-1', accessToken: 'TOK', wabaId: 'W', phoneNumberId: 'P' };

describe('provisioning chain', () => {
  it('runs Vault → subscribe → row → sync ×2 → templates, in that order', async () => {
    mockFetch();
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain(ARGS);
    expect(r.ok).toBe(true);
    expect(r.channelId).toBe('ch-new');
    expect(calls[0]).toBe('vault');
    expect(calls[1]).toBe('subscribe');
    expect(calls.filter((c) => c === 'sync')).toHaveLength(2);   // state sync + history
    expect(calls.at(-1)).toBe('templates');
  });

  it('halts BEFORE creating a row when the webhook subscription fails', async () => {
    mockFetch(['subscribe']);
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain(ARGS);
    expect(r.ok).toBe(false);
    expect(r.failedStep).toBe('subscribed_apps');
    expect(calls).not.toContain('sync');       // never got that far
    expect(r.channelId).toBeUndefined();
  });

  it('still succeeds when only templates fail — the bot works reply-only', async () => {
    mockFetch();
    templatesOk = false;
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain(ARGS);
    expect(r.ok).toBe(true);
    expect(r.state.templates).toBe(false);
  });

  it('a failed coexistence sync does NOT stamp sync_initiated_at — the 24h clock must stay unclaimed', async () => {
    mockFetch(['sync']);
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain(ARGS);
    expect(r.state.coexistence_sync).toBe(false);
    const stamped = updated.find((u) => 'sync_initiated_at' in u);
    expect(stamped?.sync_initiated_at).toBeNull();
  });
});
