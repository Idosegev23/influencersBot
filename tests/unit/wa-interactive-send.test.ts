import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('interactive WhatsApp sends', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111';
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.OUT' }], contacts: [{ wa_id: '972500000000' }] }),
      headers: { get: () => 'application/json' },
    });
  });

  it('sendInteractiveButtons posts an interactive/button body and parses the result', async () => {
    const { sendInteractiveButtons } = await import('@/lib/whatsapp-cloud/client');
    const res = await sendInteractiveButtons({
      to: '0500000000',
      body: 'ממשיכים?',
      buttons: [{ id: 'yes', title: 'כן' }, { id: 'other', title: 'משהו אחר' }],
      header: 'LA BEAUTÉ',
      footer: 'Bestie',
    });
    expect(res.success).toBe(true);
    expect(res.wa_message_id).toBe('wamid.OUT');
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.to).toBe('972500000000');
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('button');
    expect(body.interactive.action.buttons).toHaveLength(2);
    expect(body.interactive.action.buttons[0]).toEqual({ type: 'reply', reply: { id: 'yes', title: 'כן' } });
    expect(body.interactive.header).toEqual({ type: 'text', text: 'LA BEAUTÉ' });
  });

  it('sendInteractiveList posts an interactive/list body with sections', async () => {
    const { sendInteractiveList } = await import('@/lib/whatsapp-cloud/client');
    const res = await sendInteractiveList({
      to: '972500000000',
      body: 'במה נמשיך?',
      buttonLabel: 'בחירה',
      sections: [{ title: 'הפניות שלך', rows: [{ id: 't1', title: 'Argania', description: 'שאלה על מוצר' }] }],
    });
    expect(res.success).toBe(true);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.interactive.type).toBe('list');
    expect(body.interactive.action.button).toBe('בחירה');
    expect(body.interactive.action.sections[0].rows[0].id).toBe('t1');
  });
});
