import { randomBytes } from 'crypto';

/** Stable custom domain for public links (mirrors appBaseUrl in crm/quotes without
 *  pulling that module's Supabase-at-import dependency into this dep-free helper). */
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');
}

/** 144-bit URL-safe onboarding token (same strength as signature/quote tokens). */
export function newOnboardingToken(): string {
  return randomBytes(18).toString('base64url');
}

/** URL-safe slug from an account name, for the draft account's placeholder username. */
export function slugifyAccountName(name: string): string {
  const base = (name || 'account')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'account';
}

/** Public shareable onboarding link on the stable custom domain. */
export function onboardingLinkFor(token: string): string {
  return `${appBaseUrl()}/onboard/${token}`;
}
