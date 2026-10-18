import { after } from 'next/server';
import { noStore, requirePartnerHost, requestLoginCode, normalizeEmail, consoleSecret, holdUntil } from '@/lib/copilot/console-auth';
import { readJsonBody } from '@/lib/copilot/http';

const NO_STORE = { 'Cache-Control': 'no-store' };
const bad = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });

export const dynamic = 'force-dynamic';

/**
 * POST {email} -> {ok:true}, the same for every address, after the same minimum
 * delay. The code email goes out after the response, so its latency cannot tell
 * a known address from an unknown one.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const t = await requirePartnerHost(req);
  if (t instanceof Response) return t;
  if (!consoleSecret()) {
    console.error('[copilot/console-auth]', 'CONSOLE_SESSION_SECRET missing, not issuing codes');
    return bad(503, 'console_unavailable');
  }
  const parsed = await readJsonBody(req, 2048);
  if (parsed instanceof Response) return noStore(parsed);
  const email = normalizeEmail(parsed.body?.email);
  if (!email) return bad(400, 'invalid_email');

  let deliver: (() => Promise<void>) | null = null;
  try {
    deliver = await requestLoginCode({ partnerId: t.partnerId, email });
  } catch (e) {
    console.error('[copilot/console-auth]', 'request-code failed', e);
  }
  if (deliver) after(deliver);
  await holdUntil(startedAt);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
