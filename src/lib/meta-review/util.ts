export type RequestMeta = { method: 'GET' | 'POST'; url: string; note?: string };

/** Replace the access_token query value so it is never shown to the client or logged. */
export function redactToken(url: string): string {
  return url.replace(/(access_token=)[^&]+/gi, '$1***REDACTED***');
}

/** Allow ONLY same-origin relative paths as an OAuth returnTo (prevents open redirect). */
export function isSafeReturnTo(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false; // must be relative
  if (path.startsWith('//')) return false; // protocol-relative → external host
  if (path.startsWith('/\\')) return false; // backslash trick some browsers treat as //
  return true;
}
