/**
 * Browser-side helper for obtaining a signed Instagram connect URL.
 *
 * Client components can no longer build the connect URL themselves — the
 * accountId has to be signed server-side (see connect-token.ts). They ask
 * /api/auth/instagram/connect-link, which authorizes the caller first.
 */

export async function fetchIgConnectLink(opts: {
  accountId: string;
  /** Where to land after the OAuth round-trip. Must be a safe in-app path. */
  returnTo?: string;
  /** Required when the caller is an influencer rather than an admin. */
  username?: string;
}): Promise<string | null> {
  const qs = new URLSearchParams({ accountId: opts.accountId });
  if (opts.returnTo) qs.set('returnTo', opts.returnTo);
  if (opts.username) qs.set('username', opts.username);

  try {
    const res = await fetch(`/api/auth/instagram/connect-link?${qs.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}
