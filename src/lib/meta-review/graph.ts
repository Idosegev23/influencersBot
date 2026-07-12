import { redactToken, redactDeep, type RequestMeta } from './util';

export const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

type CallGraphArgs = {
  method: 'GET' | 'POST';
  url: string; // full URL WITHOUT access_token
  accessToken: string;
  body?: unknown; // POST only
};

/**
 * Perform a single Instagram Graph API call.
 * Never throws on a Graph-level error — returns the raw response body (including
 * error JSON) with ok:false so the console can display it. Rejects only on a
 * network/transport failure.
 */
export async function callGraph({ method, url, accessToken, body }: CallGraphArgs): Promise<{
  request: RequestMeta;
  response: unknown;
  ok: boolean;
}> {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}access_token=${accessToken}`;
  const request: RequestMeta = {
    method,
    url: redactToken(fullUrl),
    note: body ? `body: ${JSON.stringify(body)}` : undefined,
  };
  const res = await fetch(fullUrl, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
  // Scrub the token out of the WHOLE body — Graph embeds it in paging.next/previous URLs.
  const response = redactDeep(raw);
  return { request, response, ok: res.ok };
}
