// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot-dev.test' };
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: vi.fn(async () => T) }));
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: vi.fn(async () => ({ accountId: 'acc', partnerId: 'pA', industry: null, branding: {}, openingQuestions: [], config: {} })) }));
const getVisitor = vi.fn();
vi.mock('@/lib/copilot/visitors', () => ({ getVisitor: (...a: any[]) => getVisitor(...a) }));
const checkChatLimits = vi.fn();
vi.mock('@/lib/copilot/rate-limit', () => ({ MAX_MESSAGE_CHARS: 2000, checkChatLimits: (...a: any[]) => checkChatLimits(...a) }));
const runCopilotTurn = vi.fn();
vi.mock('@/lib/copilot/turn', () => ({ runCopilotTurn: (...a: any[]) => runCopilotTurn(...a) }));

import { POST } from '@/app/api/partner/v1/chat/route';

const SID = '11111111-2222-4333-8444-555555555555';
const VID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const req = (b: any) => new Request('http://x/api/partner/v1/chat', { method: 'POST', body: JSON.stringify(b) }) as any;
async function readNdjson(res: Response) {
  const text = await res.text();
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  vi.clearAllMocks();
  getVisitor.mockResolvedValue({ id: VID, anon_id: 'anon_aaaaaaaaaaaaaaaa' });
  checkChatLimits.mockResolvedValue({ allowed: true });
  runCopilotTurn.mockImplementation(async (_i: any, emit: any) => { emit({ type: 'delta', text: 'Hi' }); emit({ type: 'done', messageId: 'm1' }); });
});

describe('POST /chat', () => {
  it('streams NDJSON turn events', async () => {
    const res = await POST(req({ visitorId: VID, sessionId: SID, message: 'hello' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(await readNdjson(res)).toEqual([{ type: 'delta', text: 'Hi' }, { type: 'done', messageId: 'm1' }]);
    expect(checkChatLimits).toHaveBeenCalledWith({ accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' });
  });
  it('validates input before rate limiting or calling the turn', async () => {
    expect((await POST(req({ visitorId: VID, sessionId: 'nope', message: 'x' }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, sessionId: SID, message: '   ' }))).status).toBe(400);
    expect((await POST(req({ visitorId: 'not-a-uuid', sessionId: SID, message: 'x' }))).status).toBe(400);
    expect((await POST(req({ sessionId: SID, message: 'x' }))).status).toBe(400);
    expect((await POST(req({ visitorId: VID, sessionId: SID, message: 'x'.repeat(2001) }))).status).toBe(413);
    expect(getVisitor).not.toHaveBeenCalled();
    expect(checkChatLimits).not.toHaveBeenCalled();
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('404 for a visitor of another association', async () => {
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: VID, sessionId: SID, message: 'x' }))).status).toBe(404);
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('passes limiter refusals through with Retry-After', async () => {
    checkChatLimits.mockResolvedValueOnce({ allowed: false, status: 429, error: 'rate_limited', retryAfterMs: 4200 });
    const res = await POST(req({ visitorId: VID, sessionId: SID, message: 'x' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('turns an unexpected throw into an error event, not a broken stream', async () => {
    runCopilotTurn.mockImplementationOnce(async () => { throw new Error('kaboom'); });
    const lines = await readNdjson(await POST(req({ visitorId: VID, sessionId: SID, message: 'x' })));
    expect(lines.at(-1)).toEqual({ type: 'error', error: 'answer_unavailable' });
  });
  it('keeps the turn running to completion when the client disconnects mid-stream', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let emitted = 0;
    let finished = false;
    let rethrown: unknown = null;
    runCopilotTurn.mockImplementationOnce(async (_i: any, emit: any) => {
      try {
        emit({ type: 'delta', text: 'one' }); emitted++;
        await gate; // the client cancels while the turn is waiting here
        emit({ type: 'delta', text: 'two' }); emitted++;
        emit({ type: 'done', messageId: 'm1' }); emitted++;
        finished = true;
      } catch (e) { rethrown = e; throw e; }
    });
    const res = await POST(req({ visitorId: VID, sessionId: SID, message: 'x' }));
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(first.value))).toEqual({ type: 'delta', text: 'one' });
    await reader.cancel();
    release();
    await vi.waitFor(() => expect(finished).toBe(true));
    expect(emitted).toBe(3);
    expect(rethrown).toBeNull();
  });
});
