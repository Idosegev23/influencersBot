import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('sendTyping', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'PN';
    vi.restoreAllMocks();
  });
  it('POSTs a read + typing_indicator body for the inbound message id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    vi.stubGlobal('fetch', fetchMock as any);
    const { sendTyping } = await import('@/lib/whatsapp-cloud/client');
    const ok = await sendTyping('wamid.ABC');
    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.ABC',
      typing_indicator: { type: 'text' },
    });
  });
});
