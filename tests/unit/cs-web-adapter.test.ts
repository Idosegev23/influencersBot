import { describe, it, expect, vi, beforeEach } from 'vitest';

const runCsTurnCore = vi.fn();
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurnCore: (...a: any[]) => runCsTurnCore(...a) }));

import { runWebCsTurn } from '@/lib/cs/web-adapter';

describe('runWebCsTurn (web adapter, spec §5)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('threads a widget identity + boundAccountId + claimedPhone + mode into the core', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'text', body: 'היי!' }, phase: 'serving' });
    await runWebCsTurn({ channel: 'widget', accountId: 'acc-1', channelUserId: 'v-77', text: 'שלום', claimedPhone: '0501234567', language: 'he' });
    expect(runCsTurnCore).toHaveBeenCalledWith({
      identity: { channel: 'widget', visitorId: 'v-77', trust: 'unverified' },
      text: 'שלום',
      boundAccountId: 'acc-1',
      claimedPhone: '0501234567',
      mode: 'cs',
      language: 'he',
    });
  });

  it('web_chat channel builds a sessionId identity', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'text', body: 'hi' }, phase: 'serving' });
    await runWebCsTurn({ channel: 'web_chat', accountId: 'acc-1', channelUserId: 'a_xyz', text: 'hey', language: 'en', mode: 'content' });
    expect(runCsTurnCore.mock.calls[0][0]).toMatchObject({
      identity: { channel: 'web_chat', sessionId: 'a_xyz', trust: 'unverified' },
      mode: 'content',
      language: 'en',
    });
  });

  it('passes suggestions + payloads through and returns suggestion-free text', async () => {
    runCsTurnCore.mockResolvedValue({
      reply: { kind: 'text', body: 'ההזמנה בדרך!' }, phase: 'serving',
      suggestions: ['איפה ההזמנה?', 'פתיחת פנייה'],
      payloads: [{ kind: 'escalation_notice' }],
    });
    const r = await runWebCsTurn({ channel: 'widget', accountId: 'acc-1', channelUserId: 'v-1', text: 'איפה?' });
    expect(r).toEqual({ text: 'ההזמנה בדרך!', suggestions: ['איפה ההזמנה?', 'פתיחת פנייה'], payloads: [{ kind: 'escalation_notice' }] });
  });

  it('a kind:none reply (paused bot) → empty text, empty extras', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const r = await runWebCsTurn({ channel: 'widget', accountId: 'acc-1', channelUserId: 'v-1', text: 'הודעה' });
    expect(r).toEqual({ text: '', suggestions: [], payloads: [] });
  });
});
