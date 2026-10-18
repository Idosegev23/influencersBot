import { noStore, requirePartnerHost, verifyLoginCode, normalizeEmail, holdUntil } from '@/lib/copilot/console-auth';
import { readJsonBody } from '@/lib/copilot/http';

const NO_STORE = { 'Cache-Control': 'no-store' };
const bad = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });

export const dynamic = 'force-dynamic';

/** POST {email, code} -> {token, user}; every failure is the same 401 invalid_code. */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const t = await requirePartnerHost(req);
  if (t instanceof Response) return t;
  const parsed = await readJsonBody(req, 2048);
  if (parsed instanceof Response) return noStore(parsed);
  const email = normalizeEmail(parsed.body?.email);
  const code = typeof parsed.body?.code === 'string' ? parsed.body.code.trim() : '';

  let r: Awaited<ReturnType<typeof verifyLoginCode>> = { ok: false, status: 401, error: 'invalid_code' };
  if (email) {
    try {
      r = await verifyLoginCode({ partnerId: t.partnerId, email, code });
    } catch (e) {
      console.error('[copilot/console-auth]', 'verify failed', e);
    }
  }
  await holdUntil(startedAt);
  if (r.ok === false) return bad(r.status, r.error);
  return Response.json({ token: r.token, user: r.user }, { headers: NO_STORE });
}
