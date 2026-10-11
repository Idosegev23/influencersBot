import { describe, it, expect, vi, beforeEach } from 'vitest';

// wa_id is still the PK of whatsapp_cs_sessions. On 2026-10-11 every shopper who had ever
// written to Bestie's shared number crashed the bot on LA BEAUTÉ's own number: the second
// insert hit the PK and createCsSession handed back null.

const inserted: any[] = [];
let taken = new Set<string>();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let row: any;
      const ctx: any = {
        insert: (r: any) => { row = r; return ctx; },
        select: () => ctx,
        single: async () => {
          if (taken.has(row.wa_id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "whatsapp_cs_sessions_pkey"' } };
          taken.add(row.wa_id); inserted.push(row);
          return { data: { ...row }, error: null };
        },
      };
      return ctx;
    },
  },
}));

beforeEach(() => { inserted.length = 0; taken = new Set(); });

describe('one shopper, two business numbers', () => {
  it("a shopper with a session on Bestie's number still gets one on the brand's own number", async () => {
    taken.add('972547667775');   // the existing shared-number session
    const { createCsSession } = await import('@/lib/cs/cs-session');
    const row = await createCsSession('972547667775', 'c1', 'whatsapp', 'ch-lb');
    expect(row).not.toBeNull();
    expect(row.wa_id).toBe('972547667775@ch-lb');
    expect(row.channel_user_id).toBe('972547667775');   // the phone stays where code reads it
    expect(row.wa_channel_id).toBe('ch-lb');
  });

  it('a brand-new shopper keeps the plain phone key', async () => {
    const { createCsSession } = await import('@/lib/cs/cs-session');
    const row = await createCsSession('972500000001', 'c2', 'whatsapp', 'ch-lb');
    expect(row.wa_id).toBe('972500000001');
  });

  it('throws instead of returning null when the insert cannot succeed', async () => {
    taken.add('aw_visitor');
    const { createCsSession } = await import('@/lib/cs/cs-session');
    await expect(createCsSession('aw_visitor', null, 'widget' as any, null)).rejects.toThrow(/createCsSession failed/);
  });
});
