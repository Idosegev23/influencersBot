import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() factories are hoisted above top-level const declarations, so the
// mock referenced inside the factory must be created via vi.hoisted() —
// otherwise this throws "Cannot access 'insertMock' before initialization"
// regardless of what bot-quality.ts does. (Ruling R8 — deviation from the
// brief's verbatim snippet, which is broken as written; see task-2-report.md
// for the original diagnosis, carried forward into this task per the plan
// ledger.)
const { insertMock } = vi.hoisted(() => ({
  insertMock: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: insertMock }) } }));

import { recordBotGaveUp } from '@/lib/telemetry/bot-quality';

describe('recordBotGaveUp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes one events row with the surface as mode', async () => {
    await recordBotGaveUp({
      accountId: 'acc-1', sessionId: 'sess-1', surface: 'widget', reason: 'no_knowledge',
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'acc-1', session_id: 'sess-1', type: 'bot_no_answer', mode: 'widget',
    }));
  });

  it('carries the reason in the payload, never any user text', async () => {
    await recordBotGaveUp({
      accountId: 'acc-1', sessionId: null, surface: 'chat', reason: 'tool_failure',
    });
    const row = insertMock.mock.calls[0][0];
    expect(row.payload).toEqual({ reason: 'tool_failure' });
  });

  it('never throws when the insert fails — telemetry must not break a reply', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'));
    await expect(recordBotGaveUp({
      accountId: 'acc-1', sessionId: null, surface: 'chat', reason: 'llm_error',
    })).resolves.toBeUndefined();
  });
});
