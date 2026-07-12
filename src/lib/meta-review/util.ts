export type RequestMeta = { method: 'GET' | 'POST'; url: string; note?: string };

/**
 * Replace every access_token query value with a placeholder so it is never shown
 * to the client or logged. The char class stops at &, quotes, and whitespace so a
 * token that ends a URL value (e.g. inside a JSON string) is fully caught.
 */
export function redactToken(url: string): string {
  return url.replace(/(access_token=)[^&"'\s]+/gi, '$1***REDACTED***');
}

/**
 * Recursively redact tokens from any parsed JSON value. Graph list responses embed
 * the real access_token inside paging.next / paging.previous cursor URLs, so the
 * whole response body must be scrubbed before it reaches the client.
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactToken(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v);
    return out as unknown as T;
  }
  return value;
}

/** True if the string contains any C0 control char, space, or DEL (0x00-0x20 or 0x7f). */
function hasControlOrSpace(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Allow ONLY same-origin relative paths as an OAuth returnTo (prevents open redirect).
 * Rejects control/whitespace chars first, because the WHATWG URL parser strips
 * tab/CR/LF before parsing, which would otherwise turn a tab-laced "/<tab>/evil.com"
 * into the protocol-relative "//evil.com".
 */
export function isSafeReturnTo(path: string | null | undefined): path is string {
  if (!path) return false;
  if (hasControlOrSpace(path)) return false; // tab/newline/CR/space strip tricks
  if (!path.startsWith('/')) return false; // must be relative
  if (path.startsWith('//')) return false; // protocol-relative -> external host
  if (path.startsWith('/\\')) return false; // backslash trick some browsers treat as //
  return true;
}
