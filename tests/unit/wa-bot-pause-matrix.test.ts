import { describe, it, expect } from 'vitest';
import { shouldAutoResume, DEFAULT_IDLE_RESUME_HOURS } from '@/lib/handoff/auto-resume';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('pause TTL matrix (spec D7)', () => {
  it('a fresh human reply keeps the bot paused', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(1 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('6h of human silence releases it', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(7 * HOUR) }, 6, NOW)).toBe(true);
  });

  it('exactly at the threshold does NOT resume — strictly greater', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(6 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('a manual takeover NEVER auto-resumes, however long the silence', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'manual_takeover', human_last_reply_at: iso(500 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('a paused session with no recorded reply does not resume on a guess', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: null }, 6, NOW)).toBe(false);
  });

  it('an unrecognised pause reason never auto-resumes — only human_reply expires', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'escalated', human_last_reply_at: iso(99 * HOUR) }, 6, NOW)).toBe(false);
    expect(shouldAutoResume({ bot_paused_reason: null, human_last_reply_at: iso(99 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('a corrupt timestamp does not resume — NaN must not read as "long ago"', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: 'not-a-date' }, 6, NOW)).toBe(false);
  });

  it('the default idle window is 6 hours', () => {
    expect(DEFAULT_IDLE_RESUME_HOURS).toBe(6);
  });
  // ── Escalation pauses (added 2026-09-07) ───────────────────────────────────
  // The rule above only ever expired 'human_reply'. Production never writes the string
  // 'escalated' — pauseBot is called with `escalate:<reason>` (tools/index.ts) and
  // `handoff:<triggers>` (escalation/dispatch.ts), so EVERY escalation pause was permanent by
  // construction. Measured on 2026-09-07: 141 muted WhatsApp threads, 107 customers who kept
  // writing, 578 unanswered messages, one muted 5 weeks. These are the real reason strings.
  const ESCALATION_IDLE = 24;

  it('an escalate: pause expires once nobody has answered for the escalation window', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:לקוח מסר אימייל לבדיקת סטטוס', human_last_reply_at: null, bot_paused_at: iso(25 * HOUR) },
      6, NOW)).toBe(true);
  });

  it('a handoff: pause expires the same way', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'handoff:human_demand', human_last_reply_at: null, bot_paused_at: iso(25 * HOUR) },
      6, NOW)).toBe(true);
  });

  it('a FRESH escalation stays paused — a human gets the full window to pick it up', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: null, bot_paused_at: iso(2 * HOUR) },
      6, NOW)).toBe(false);
  });

  it('exactly at the escalation threshold does NOT resume — strictly greater, as above', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: null, bot_paused_at: iso(ESCALATION_IDLE * HOUR) },
      6, NOW)).toBe(false);
  });

  // The whole point of a pause is not talking over a human. If one IS engaged, the clock restarts
  // from THEIR last message, not from the escalation.
  it('a human who replied recently keeps an old escalation paused', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: iso(1 * HOUR), bot_paused_at: iso(300 * HOUR) },
      6, NOW)).toBe(false);
  });

  it('a human who replied and then went quiet past the window releases it', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: iso(30 * HOUR), bot_paused_at: iso(300 * HOUR) },
      6, NOW)).toBe(true);
  });

  it('a manual takeover STILL never resumes, even aged past the escalation window', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'manual', human_last_reply_at: null, bot_paused_at: iso(9000 * HOUR) },
      6, NOW)).toBe(false);
  });

  it('an escalation with no bot_paused_at fails closed rather than guessing it is old', () => {
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: null, bot_paused_at: null },
      6, NOW)).toBe(false);
    expect(shouldAutoResume(
      { bot_paused_reason: 'escalate:refund', human_last_reply_at: null, bot_paused_at: 'not-a-date' },
      6, NOW)).toBe(false);
  });

});
