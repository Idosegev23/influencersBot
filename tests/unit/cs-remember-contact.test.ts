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

  // Storing a fragment would recreate the original bug one level down: the agent sees a number,
  // hits send, and only Meta tells them it is not dialable.
  it('rejects a fragment instead of storing it', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '3064' }, makeCtx());
    expect(r.ok).toBe(false);
    expect((r.data as any).reason).toBe('invalid_phone');
    expect(updates.length).toBe(0);
  });

  it('rejects an empty value', async () => {
    const updates: any[] = [];
    const tool = await loadTool(updates);
    const r = await tool.handler({ phone: '' }, makeCtx());
    expect(r.ok).toBe(false);
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
