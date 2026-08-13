// Shared widget CORS policy — extracted from /api/widget/chat so every widget endpoint
// (chat, order-lookup, …) enforces the SAME origin allow-list instead of echoing any origin.
export function getWidgetCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Validate that the request origin matches the account's registered domain.
 * Allows: localhost (dev), vercel preview deploys, our own domains, and the account's domain.
 */
export function isWidgetOriginAllowed(origin: string, accountDomain?: string): boolean {
  if (!origin || origin === 'null') return true; // server-side or file:// requests
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.vercel.app')
      || url.hostname.endsWith('bestieai.co.il')
      || url.hostname.endsWith('ldrsgroup.com')) return true;
    if (accountDomain && url.hostname.endsWith(accountDomain.replace(/^www\./, ''))) return true;
  } catch { /* invalid URL */ }
  return false;
}
