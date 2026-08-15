import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendText, sendTemplate, markAsRead } from '@/lib/whatsapp-cloud/client';
import type { WaChannel } from '@/lib/whatsapp-cloud/channels';

const CH: WaChannel = {
  id: 'ch-9', accountId: 'acc-9', wabaId: 'waba-9', phoneNumberId: 'PNID_CUSTOMER',
  displayPhoneNumber: '+972 50-000-0000', verifiedName: 'Customer', token: 'TOK_CUSTOMER',
  status: 'active', paymentReady: true,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ messages: [{ id: 'wamid.X' }], contacts: [{ wa_id: '972500000000' }] }),
    text: async () => '',
  })));
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_BESTIE';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID_BESTIE';
});

function lastCall() {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  return { url: String(f.mock.calls[0][0]), init: f.mock.calls[0][1] as RequestInit };
}

describe('send path is channel-scoped', () => {
  it('sendText posts to the CHANNEL phone number id, not the env one', async () => {
    await sendText({ to: '972500000000', body: 'hi', channel: CH });
    const { url, init } = lastCall();
    expect(url).toContain('/PNID_CUSTOMER/messages');
    expect(url).not.toContain('PNID_BESTIE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK_CUSTOMER');
  });

  it('sendTemplate uses the channel token', async () => {
    await sendTemplate({ to: '972500000000', templateName: 'cs_followup', languageCode: 'he', channel: CH });
    const { init } = lastCall();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK_CUSTOMER');
  });

  it('markAsRead is channel-scoped too', async () => {
    await markAsRead('wamid.IN', CH);
    expect(lastCall().url).toContain('/PNID_CUSTOMER/messages');
  });

  it('a missing channel throws loudly instead of falling back to env', async () => {
    // @ts-expect-error deliberately omitting the required channel
    await expect(sendText({ to: '972500000000', body: 'hi' })).rejects.toThrow(/channel/i);
  });
});
