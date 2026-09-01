import { describe, it, expect } from 'vitest';
import { emailGate } from '@/lib/support/email-deliverability';

// emailGate lives in the module rather than in the route so this file can test a pure
// function without importing Supabase, Gmail and WhatsApp behind it.

describe('emailGate — only `undeliverable` blocks, and only with no phone', () => {
  it('blocks a dead address when there is no dialable phone', () => {
    const r = emailGate(
      { status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx', suggestion: 'gmail.com' },
      null,
      true,
    );
    expect(r).toMatchObject({ blocked: true, suggestion: 'gmail.com' });
  });

  it('lets a dead address through when a dialable phone exists', () => {
    // לילי's real ticket: gmail.com.il, but 0526936571 was right there. Losing the ticket
    // would have been strictly worse than filing it with a note.
    const r = emailGate(
      { status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' },
      '0526936571',
      true,
    );
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks on a typo verdict, even with no phone', () => {
    const r = emailGate({ status: 'typo', email: 'a@gamil.com', suggestion: 'gmail.com' }, null, true);
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks on unknown, even with no phone', () => {
    const r = emailGate({ status: 'unknown', email: 'a@clalit.org.il' }, null, true);
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks a good address', () => {
    expect(emailGate({ status: 'ok', email: 'a@gmail.com' }, null, true)).toMatchObject({ blocked: false });
  });

  it('ignores an undialable phone when deciding', () => {
    // 'aw_1a2b3c' is a widget visitor id, not a number — realPhoneOrNull rejects it, so it
    // must not count as a fallback route.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, 'aw_1a2b3c', true);
    expect(r).toMatchObject({ blocked: true });
  });
});

describe('emailGate — the per-account rollout switch', () => {
  it('does not block when the account has not opted in', () => {
    // Absence means permissive. Every existing account keeps today's behaviour until
    // someone turns this on for them.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, null, false);
    expect(r).toMatchObject({ blocked: false });
  });

  it('blocks once the account has opted in', () => {
    // Companion: without this, a gate hard-wired to never block would pass the test above.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, null, true);
    expect(r).toMatchObject({ blocked: true });
  });
});
