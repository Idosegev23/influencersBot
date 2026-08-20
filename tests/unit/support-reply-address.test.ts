import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRawEmail } from '@/lib/email';

function decode(raw: string): string {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

// Supabase fake for the support_agents fallback lookup.
function makeSupabase(agents: any[] = []) {
  return {
    from: () => {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.then = (r: any) => r({ data: agents, error: null });
      return ctx;
    },
  } as any;
}

describe('buildRawEmail Reply-To', () => {
  it('emits a Reply-To header when given one', () => {
    const raw = decode(buildRawEmail({ to: 'c@x.com', subject: 'hi', html: '<p>hi</p>', replyTo: 'csr@brand.com' }));
    expect(raw).toContain('Reply-To: csr@brand.com');
  });

  it('omits the header entirely when none is given (unchanged behaviour)', () => {
    const raw = decode(buildRawEmail({ to: 'c@x.com', subject: 'hi', html: '<p>hi</p>' }));
    expect(raw).not.toContain('Reply-To:');
  });
});

describe('resolveBrandReplyTo', () => {
  beforeEach(() => vi.resetModules());

  it('prefers the nominated support_email', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    const r = await resolveBrandReplyTo(makeSupabase(), {
      id: 'a1',
      config: { support_email: 'support@brand.com', escalation: { recipients: [{ email: 'other@brand.com' }] } },
    });
    expect(r).toBe('support@brand.com');
  });

  it('falls back to the first escalation recipient', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    const r = await resolveBrandReplyTo(makeSupabase(), {
      id: 'a1',
      config: { escalation: { recipients: [{ name: 'שירות', email: 'csrlabeaute@gmail.com' }] } },
    });
    expect(r).toBe('csrlabeaute@gmail.com');
  });

  it('falls back to an active support agent', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    const r = await resolveBrandReplyTo(makeSupabase([{ first_name: 'ליז', email: 'liz@brand.com', is_active: true }]), {
      id: 'a1',
      config: {},
    });
    expect(r).toBe('liz@brand.com');
  });

  // Guessing an address would send a customer's reply to the wrong business.
  it('returns null when the brand gave no address at all', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    expect(await resolveBrandReplyTo(makeSupabase(), { id: 'a1', config: {} })).toBeNull();
  });

  it('rejects a malformed configured address instead of using it', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    const r = await resolveBrandReplyTo(makeSupabase(), {
      id: 'a1',
      config: { support_email: 'not-an-email', escalation: { recipients: [{ email: 'good@brand.com' }] } },
    });
    expect(r).toBe('good@brand.com');
  });

  it('returns null without an account', async () => {
    const { resolveBrandReplyTo } = await import('@/lib/support/reply-address');
    expect(await resolveBrandReplyTo(makeSupabase(), null)).toBeNull();
  });
});
