import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeCtx(over: any = {}) {
  return {
    waId: 'aw_x1',
    accountId: 'acc-1',
    chatSessionId: 'cs1',
    ticketId: 't1',
    customerName: 'סיגלית',
    identity: { channel: 'widget', visitorId: 'aw_x1', trust: 'unverified' },
    ...over,
  } as any;
}

describe('remember_contact', () => {
  beforeEach(() => vi.resetModules());

  async function loadTool(updates: any[]) {
    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        from: () => {
          const ctx: any = {};
          ctx.update = (row: any) => { updates.push(row); return ctx; };
          ctx.eq = () => ctx;
          ctx.select = () => ctx;
          ctx.single = async () => ({ data: null, error: null });
          ctx.then = (r: any) => r({ data: null, error: null });
          return ctx;
        },
      },
    }));
    const { getCsTools } = await import('@/lib/cs/tools/index');
    return getCsTools().find((t) => t.def.function.name === 'remember_contact')!;
  }

  it('saves a valid phone and writes it straight to the open ticket', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '054-598-9978' }, makeCtx());
    expect(r.ok).toBe(true);
    expect(r.learnedPhone).toBe('054-598-9978');
    expect(updates[0].customer_phone).toBe('054-598-9978');
  });

  it('saves an email on its own — a shopper with no phone is still reachable', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ email: ' Sigalit@Gmail.com ' }, makeCtx());
    expect(r.ok).toBe(true);
    expect(r.learnedEmail).toBe('sigalit@gmail.com');
    expect(updates[0].customer_email).toBe('sigalit@gmail.com');
    expect(updates[0].customer_phone).toBeUndefined();
  });

  it('saves both when both are given', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '0545989978', email: 'a@b.com' }, makeCtx());
    expect(r.learnedPhone).toBe('0545989978');
    expect(r.learnedEmail).toBe('a@b.com');
  });

  it('keeps the good half when the other is junk', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '3064', email: 'a@b.com' }, makeCtx());
    expect(r.ok).toBe(true);
    expect(r.learnedPhone).toBeUndefined();
    expect(updates[0].customer_email).toBe('a@b.com');
    expect(updates[0].customer_phone).toBeUndefined();
  });

  // Storing a fragment would recreate the original bug one level down: the agent sees a number,
  // hits send, and only Meta tells them it is not dialable.
  it('rejects a fragment instead of storing it', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '3064' }, makeCtx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('invalid_contact');
    expect(updates.length).toBe(0);
  });

  it('rejects when neither half is usable', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    for (const args of [{ phone: '' }, {}, { phone: '3064', email: 'לא רוצה' }]) {
      const r = await tool.handler(args, makeCtx());
      expect(r.ok).toBe(false);
      expect((r.data as any).reason).toBe('invalid_contact');
    }
    expect(updates.length).toBe(0);
  });

  it('still reports the phone when there is no ticket to write to yet', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '0545989978' }, makeCtx({ ticketId: null }));
    expect(r.learnedPhone).toBe('0545989978');
    expect(updates.length).toBe(0);
  });
});

describe('remember_contact availability', () => {
  beforeEach(() => vi.resetModules());

  it('is offered on the widget, where the shopper is anonymous', async () => {
    const { buildCsToolset } = await import('@/lib/cs/tools/registry');
    const { defs } = buildCsToolset({ channel: 'widget', account: null });
    expect(defs.map((d) => d.function.name)).toContain('remember_contact');
  });

  it('is NOT offered on WhatsApp, where the sender number is the contact', async () => {
    const { buildCsToolset } = await import('@/lib/cs/tools/registry');
    const { defs } = buildCsToolset({ channel: 'whatsapp', account: null });
    expect(defs.map((d) => d.function.name)).not.toContain('remember_contact');
  });

  it('survives the non-brand archetype filter', async () => {
    const { buildCsToolset } = await import('@/lib/cs/tools/registry');
    const { defs } = buildCsToolset({
      channel: 'web_chat',
      account: { archetype: 'government_ministry', config: {} },
    });
    expect(defs.map((d) => d.function.name)).toContain('remember_contact');
  });
});

describe('escalate_to_human contact gate', () => {
  beforeEach(() => vi.resetModules());

  async function loadEscalate(handoff: any[]) {
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: () => {
      const c: any = {}; c.select = () => c; c.eq = () => c; c.update = () => c; c.single = async () => ({ data: null }); c.maybeSingle = async () => ({ data: null }); c.then = (r: any) => r({ data: [], error: null }); return c;
    } } }));
    vi.doMock('@/engines/escalation/dispatch', () => ({
      runCsHandoffCheck: vi.fn(async (i: any) => { handoff.push(i); return { escalated: true }; }),
    }));
    vi.doMock('@/lib/handoff/bot-pause', () => ({ pauseBot: vi.fn(async () => {}) }));
    const { getCsTools } = await import('@/lib/cs/tools/index');
    return getCsTools().find((t) => t.def.function.name === 'escalate_to_human')!;
  }

  const webCtx = (over: any = {}) => ({
    waId: 'aw_x1', accountId: 'acc-1', chatSessionId: 'cs1', ticketId: 't1', customerName: 'סיגלית',
    identity: { channel: 'widget', visitorId: 'aw_x1', trust: 'unverified' },
    contactEmail: null, contactAsked: false, ...over,
  }) as any;

  // The whole point: a hand-off with no contact route is a promise nobody can keep.
  it('refuses to hand off an anonymous web shopper and asks for details first', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג' }, webCtx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('contact_required');
    expect(r.contactAsked).toBe(true);
    expect(handoff.length).toBe(0); // nothing was dispatched
  });

  it('hands off once a phone is known', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג' }, webCtx({
      identity: { channel: 'widget', visitorId: 'aw_x1', phone: '0545989978', trust: 'phone_claimed' },
    }));
    expect(r.escalated).toBe(true);
    expect(handoff[0].contactPhone).toBe('0545989978');
  });

  it('hands off when only an email is known, and passes it along', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג' }, webCtx({ contactEmail: 'sigalit@gmail.com' }));
    expect(r.escalated).toBe(true);
    expect(handoff[0].contactEmail).toBe('sigalit@gmail.com');
  });

  // Blocking twice would trap an angry shopper with a bot — worse than a ticket with no phone.
  it('opens after the shopper was already asked in an earlier turn', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג' }, webCtx({ contactAsked: true }));
    expect(r.escalated).toBe(true);
    expect(handoff[0].contactPhone).toBeNull(); // handed off with no contact route, honestly recorded
  });

  it('opens when the model reports the shopper refused', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג', contact_refused: true }, webCtx());
    expect(r.escalated).toBe(true);
  });

  // On WhatsApp the sender number IS the contact — the gate must never fire there.
  it('never blocks a WhatsApp hand-off', async () => {
    const handoff: any[] = [];
    const tool = await loadEscalate(handoff);
    const r = await tool.handler({ reason: 'רוצה נציג' }, webCtx({
      waId: '972501234567',
      identity: { channel: 'whatsapp', waId: '972501234567', waChannelId: 'ch1', trust: 'channel_verified' },
    }));
    expect(r.escalated).toBe(true);
  });
});

