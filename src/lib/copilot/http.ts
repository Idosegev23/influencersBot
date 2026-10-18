/** Small request helpers shared by the partner write routes (/contact, /recap). */

export const MAX_BODY_BYTES = 16_384;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export const bad = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers });

/**
 * Reads a JSON body capped at `max` bytes (declared Content-Length and actual size).
 * Returns the parsed body (null when it is not JSON) or a 413 response.
 */
export async function readJsonBody(req: Request, max = MAX_BODY_BYTES): Promise<{ body: any } | Response> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return bad(413, 'request_too_large');
  const raw = await req.text().catch(() => '');
  if (new TextEncoder().encode(raw).length > max) return bad(413, 'request_too_large');
  try {
    const body = JSON.parse(raw);
    return { body: body && typeof body === 'object' && !Array.isArray(body) ? body : null };
  } catch {
    return { body: null };
  }
}

/** Limiter refusal as a response, with Retry-After in whole seconds. */
export const limited = (l: { status: number; error: string; retryAfterMs: number }) =>
  bad(l.status, l.error, { 'Retry-After': String(Math.ceil(l.retryAfterMs / 1000)) });

/** Display name for emails, from accounts.config. */
export function associationNameOf(config: unknown): string {
  const c = (config ?? {}) as any;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return s(c.display_name) ?? s(c.username) ?? 'association';
}
