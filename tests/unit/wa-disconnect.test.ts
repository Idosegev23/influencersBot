import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteToken = vi.fn(async () => {});
vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({
  deleteToken,
  storeToken: vi.fn(async () => 'sec-1'),
  readToken: vi.fn(async () => 'TOK'),
}));

const updates: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: channelRow }) }) }),
      update: (patch: any) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));

let channelRow: any;

beforeEach(() => {
  deleteToken.mockClear(); updates.length = 0;
  channelRow = { id: 'ch-1', waba_id: 'W', token_secret_id: 'sec-1', account_id: 'acc-1', phone_number_id: 'PNID' };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })));
});

describe('disconnect', () => {
  it('unsubscribes the webhook, DELETES the vault secret, and marks the row disconnected', async () => {
    const { disconnectChannel } = await import('@/lib/whatsapp-cloud/provisioning');
    await disconnectChannel('ch-1');

    const call = (fetch as any).mock.calls[0];
    expect(String(call[0])).toContain('/W/subscribed_apps');
    expect(call[1]).toMatchObject({ method: 'DELETE' });

    // Flagging the row is NOT enough — the credential itself has to go.
    expect(deleteToken).toHaveBeenCalledWith('sec-1');

    const patch = updates.at(-1);
    expect(patch.status).toBe('disconnected');
    expect(patch.token_secret_id).toBeNull();
    expect(patch.payment_ready).toBe(false);
  });

  it('still deletes the secret when Meta refuses the unsubscribe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => '' })));
    const { disconnectChannel } = await import('@/lib/whatsapp-cloud/provisioning');
    await disconnectChannel('ch-1');
    // Leaving a live credential behind because a remote call failed would be the worse outcome.
    expect(deleteToken).toHaveBeenCalledWith('sec-1');
    expect(updates.at(-1).status).toBe('disconnected');
  });

  it('is a no-op for an unknown channel', async () => {
    channelRow = null;
    const { disconnectChannel } = await import('@/lib/whatsapp-cloud/provisioning');
    await disconnectChannel('nope');
    expect(deleteToken).not.toHaveBeenCalled();
  });
});
