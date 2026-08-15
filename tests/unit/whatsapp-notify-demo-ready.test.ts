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


// Mock the WA client before importing the module under test.
const sendTemplateMock = vi.fn();
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendTemplate: (...args: any[]) => sendTemplateMock(...args),
  toWaId: (s: string) => s,
}));
// persistOutbound uses supabase — stub it out entirely.
vi.mock('@/lib/supabase', () => ({
  createClient: () => { throw new Error('no supabase in unit test'); },
}));

async function loadModule() {
  vi.resetModules();
  process.env.WHATSAPP_NOTIFY_ENABLED = 'true';
  delete process.env.WHATSAPP_TEMPLATE_DEMO_READY;
  return import('@/lib/whatsapp-notify');
}

beforeEach(() => sendTemplateMock.mockReset());

describe('sendDemoReady with accountId (demo_ready_v2)', () => {
  it('sends demo_ready_v2 with two URL button components (index 0 = slug, index 1 = accountId)', async () => {
    sendTemplateMock.mockResolvedValue({ success: true });
    const { sendDemoReady } = await loadModule();

    const res = await sendDemoReady({
      to: '972500000000',
      brandName: 'מאוחדת',
      accountUsername: 'meuhedet',
      accountId: '4214549f-813b-406b-8b71-6550268235bb',
    });

    expect(res.success).toBe(true);
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const call = sendTemplateMock.mock.calls[0][0];
    expect(call.templateName).toBe('demo_ready_v2');
    const buttons = call.components.filter((c: any) => c.type === 'button');
    expect(buttons).toEqual([
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'meuhedet' }] },
      { type: 'button', sub_type: 'url', index: 1, parameters: [{ type: 'text', text: '4214549f-813b-406b-8b71-6550268235bb' }] },
    ]);
  });

  it('falls back to demo_ready_v1 (chat button only) when the v2 send fails', async () => {
    sendTemplateMock
      .mockResolvedValueOnce({ success: false, error: { code: 132001, message: 'template not found' } })
      .mockResolvedValueOnce({ success: true });
    const { sendDemoReady } = await loadModule();

    const res = await sendDemoReady({
      to: '972500000000',
      brandName: 'מאוחדת',
      accountUsername: 'meuhedet',
      accountId: '4214549f-813b-406b-8b71-6550268235bb',
    });

    expect(res.success).toBe(true);
    expect(sendTemplateMock).toHaveBeenCalledTimes(2);
    expect(sendTemplateMock.mock.calls[0][0].templateName).toBe('demo_ready_v2');
    const fb = sendTemplateMock.mock.calls[1][0];
    expect(fb.templateName).toBe('demo_ready_v1');
    const fbButtons = fb.components.filter((c: any) => c.type === 'button');
    expect(fbButtons).toEqual([
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'meuhedet' }] },
    ]);
  });

  it('without accountId sends demo_ready_v1 exactly as before (backward compat)', async () => {
    sendTemplateMock.mockResolvedValue({ success: true });
    const { sendDemoReady } = await loadModule();

    await sendDemoReady({ to: '972500000000', brandName: 'נייק', accountUsername: 'nike_il' });

    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock.mock.calls[0][0].templateName).toBe('demo_ready_v1');
  });
});
