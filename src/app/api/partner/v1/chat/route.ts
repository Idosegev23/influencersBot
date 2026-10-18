import { after } from 'next/server';
import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { checkChatLimits, MAX_MESSAGE_CHARS } from '@/lib/copilot/rate-limit';
import { runCopilotTurn, type TurnEvent } from '@/lib/copilot/turn';
import type { AssociationTenant } from '@/lib/copilot/tenant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A turn that outlives this stops streaming with an error; it may still finish in the background.
const TURN_DEADLINE_MS = 50_000;
// Body of a valid request is a few KB at most (message <= 2000 chars).
const MAX_BODY_BYTES = 16_384;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers });

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad(413, 'message_too_long');

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (
    !body ||
    typeof body.visitorId !== 'string' || !UUID.test(body.visitorId) ||
    typeof body.sessionId !== 'string' || !UUID.test(body.sessionId) ||
    !message
  ) {
    return bad(400, 'invalid_request');
  }
  if (message.length > MAX_MESSAGE_CHARS) return bad(413, 'message_too_long');

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return bad(limit.status, limit.error, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');

  const encoder = new TextEncoder();
  // Set when the client goes away. The turn is never aborted: it runs to
  // completion so the answer and its cost are saved; we just stop writing.
  let closed = false;
  // Tell the platform to keep the function alive until the turn has really
  // finished, even if the client disconnects and the response ends early.
  let settle!: () => void;
  const finished = new Promise<void>((r) => (settle = r));
  after(() => finished);

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: TurnEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        } catch {
          closed = true;
        }
      };
      const turn = (async () => {
        try {
          await runCopilotTurn({ tenant, assoc, visitor, sessionId: body.sessionId, message }, emit);
        } catch (e) {
          console.error('[copilot/chat]', 'turn threw', tenant.accountId, e instanceof Error ? e.message : e);
          emit({ type: 'error', error: 'answer_unavailable' });
        }
      })().finally(settle);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), TURN_DEADLINE_MS); });
      try {
        const outcome = await Promise.race([turn.then(() => 'done' as const), deadline]);
        if (outcome === 'timeout') {
          console.error('[copilot/chat]', 'turn deadline exceeded', tenant.accountId);
          emit({ type: 'error', error: 'answer_unavailable' });
        }
      } finally {
        clearTimeout(timer);
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed or cancelled */ }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
