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
});
