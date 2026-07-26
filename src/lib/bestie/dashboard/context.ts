/**
 * Who is asking, and where are they standing.
 *
 * accountId is resolved server-side from the authenticated session and lives
 * only here. No tool takes it as an argument (spec §4.1) — the model has no way
 * to name an account, so it has no way to read one it should not see.
 *
 * currentRoute is what makes this feel unlike documentation: "the switch is on
 * this screen, second tab" instead of "go to bot settings".
 */

export interface DashboardCtx {
  accountId: string;
  username: string;
  currentRoute: string | null;
  language: string;
}

/** /influencer/insights is a screen, not someone's username. */
const NON_ACCOUNT_SEGMENTS = new Set(['insights']);

export function normalizeCurrentRoute(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const path = String(raw).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts[0] !== 'influencer' || parts.length < 2) return null;
  if (NON_ACCOUNT_SEGMENTS.has(parts[1])) return `/influencer/${parts[1]}`;

  const rest = parts.slice(2);
  return ['/influencer/[username]', ...rest].join('/');
}
