/**
 * Demo lifecycle — is this account's demo still open?
 *
 * A demo account scanned from 2026-08-19 onward carries `config.demo`:
 *
 *   { starts_at, ends_at, extended_to?, first_open_at?, first_chat_at?,
 *     locked_at?, lead_sent_at? }
 *
 * The effective end of the window is `extended_to ?? ends_at` — `ends_at` is
 * written once at scan time and never rewritten, so the original window stays
 * legible after an admin extends it.
 *
 * TWO RULES GOVERN EVERYTHING HERE, and both exist to protect live accounts:
 *
 *  1. ABSENCE MEANS OPEN. An account with no `config.demo` is never locked.
 *     Every demo scanned before this feature shipped, and every paying
 *     customer, falls into this branch. That is the whole safety story.
 *
 *  2. MALFORMED MEANS OPEN. Garbage dates resolve to `open`, never `locked`.
 *     Failing open costs us a demo that outlives its week; failing closed puts
 *     a sales screen in front of somebody who is paying us. The asymmetry is
 *     not close.
 *
 * This module is pure — no I/O, no clock of its own beyond an injectable
 * `now` — so the gate can be exercised exhaustively in unit tests and reused
 * identically by server components, API routes and crons.
 */

/** How long a fresh demo stays open. */
export const DEMO_WINDOW_DAYS = 7;

/** Inside this many days of the end, the countdown turns urgent. */
export const DEMO_EXPIRING_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DemoState = 'open' | 'expiring' | 'locked';

export interface DemoAccess {
  state: DemoState;
  /** Effective end of the window (ISO), or null when this is not a timed demo. */
  endsAt: string | null;
  /** Whole days remaining, rounded up; 0 once locked; null when untimed. */
  daysLeft: number | null;
}

export interface DemoConfig {
  starts_at: string;
  ends_at: string;
  extended_to: string | null;
  first_open_at: string | null;
  first_chat_at: string | null;
  locked_at: string | null;
  lead_sent_at: string | null;
}

const UNTIMED: DemoAccess = { state: 'open', endsAt: null, daysLeft: null };

/** Parse an ISO string to epoch ms, or null for anything that isn't one. */
function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The demo window for an account, or `open` with nulls when it has none.
 *
 * `account` is deliberately loose: callers pass whatever row shape they already
 * hold (a full account, a `{ config }` projection) without reshaping it.
 */
export function resolveDemoAccess(
  account: { config?: any } | null | undefined,
  now: Date = new Date(),
): DemoAccess {
  const demo = account?.config?.demo;
  // Rule 1 — no demo object (or not an object at all) means this is not a
  // timed demo, so there is nothing to expire.
  if (!demo || typeof demo !== 'object' || Array.isArray(demo)) return UNTIMED;

  // Rule 2 — an extension only counts if it parses; otherwise fall back to the
  // original end rather than letting bad data decide.
  const endMs = parseIso(demo.extended_to) ?? parseIso(demo.ends_at);
  if (endMs === null) return UNTIMED;

  const endsAt = new Date(endMs).toISOString();
  const remainingMs = endMs - now.getTime();

  if (remainingMs <= 0) return { state: 'locked', endsAt, daysLeft: 0 };

  // Round up: three hours left is still "1 day", never "0 days" on a live demo.
  const daysLeft = Math.ceil(remainingMs / DAY_MS);
  const state: DemoState = daysLeft <= DEMO_EXPIRING_DAYS ? 'expiring' : 'open';
  return { state, endsAt, daysLeft };
}

/** True when the account is a timed demo whose window has closed. */
export function isDemoLocked(account: { config?: any } | null | undefined, now?: Date): boolean {
  return resolveDemoAccess(account, now).state === 'locked';
}

/** A fresh 7-day window. Written once at scan completion, never rewritten. */
export function buildDemoConfig(startedAt: Date = new Date()): DemoConfig {
  return {
    starts_at: startedAt.toISOString(),
    ends_at: new Date(startedAt.getTime() + DEMO_WINDOW_DAYS * DAY_MS).toISOString(),
    extended_to: null,
    first_open_at: null,
    first_chat_at: null,
    locked_at: null,
    lead_sent_at: null,
  };
}

/**
 * Push a demo's end out by a week.
 *
 * Measured from whichever is later — now, or the current end — so extending a
 * demo that still has days left ADDS to it rather than silently shortening it
 * to seven days from today.
 *
 * `locked_at` is cleared so the watch cron can announce the new end when it
 * arrives; without that, an extended-then-re-expired demo would lock in
 * silence and nobody would know to follow up.
 */
export function extendDemoWindow(
  demo: Partial<DemoConfig> | null | undefined,
  now: Date = new Date(),
  days: number = DEMO_WINDOW_DAYS,
): Partial<DemoConfig> | null {
  if (!demo || typeof demo !== 'object') return null;
  const currentEnd = parseIso(demo.extended_to) ?? parseIso(demo.ends_at);
  const base = currentEnd !== null ? Math.max(now.getTime(), currentEnd) : now.getTime();
  return {
    ...demo,
    extended_to: new Date(base + days * DAY_MS).toISOString(),
    locked_at: null,
  };
}
