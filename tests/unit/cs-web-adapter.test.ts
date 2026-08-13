import { describe, it, expect, vi, beforeEach } from 'vitest';

const runCsTurnCore = vi.fn();
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurnCore: (...a: any[]) => runCsTurnCore(...a) }));

import { runWebCsTurn, emitWebCsEvents } from '@/lib/cs/web-adapter';

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

  it('emitWebCsEvents emits delta → payload×N → suggestions → done, in that order', async () => {
    runCsTurnCore.mockResolvedValue({
      reply: { kind: 'text', body: 'הנה הסטטוס' }, phase: 'serving',
      suggestions: ['תודה'],
      payloads: [{ kind: 'order_status_card', order: { orderNumber: '1042' } }, { kind: 'ticket_confirmation', ticketId: 't-1' }],
    });
    const events: any[] = [];
    await emitWebCsEvents((e) => events.push(e), { channel: 'widget', accountId: 'acc-1', channelUserId: 'v-1', text: 'איפה?' });
    expect(events.map((e) => e.type)).toEqual(['delta', 'payload', 'payload', 'suggestions', 'done']);
    expect(events[0].text).toBe('הנה הסטטוס');
    expect(events[1].payload.kind).toBe('order_status_card');
    expect(events[3].suggestions).toEqual(['תודה']);
    expect(events[4]).toMatchObject({ type: 'done', fullText: 'הנה הסטטוס', cs: true });
  });

  it('suggestionsInDone (chat page): suggestions re-embed into done.fullText, no suggestions event', async () => {
    runCsTurnCore.mockResolvedValue({
      reply: { kind: 'text', body: 'בטיפול!' }, phase: 'serving',
      suggestions: ['תודה', 'עוד שאלה'],
    });
    const events: any[] = [];
    await emitWebCsEvents((e) => events.push(e), { channel: 'web_chat', accountId: 'acc-1', channelUserId: 'a_1', text: 'הי' }, { suggestionsInDone: true });
    expect(events.map((e) => e.type)).toEqual(['delta', 'done']);
    expect(events[1].fullText).toBe('בטיפול!<<SUGGESTIONS>>תודה|עוד שאלה<</SUGGESTIONS>>');
  });

  it('emitWebCsEvents on a silent turn (paused) emits only done', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const events: any[] = [];
    await emitWebCsEvents((e) => events.push(e), { channel: 'widget', accountId: 'acc-1', channelUserId: 'v-1', text: 'הודעה' });
    expect(events.map((e) => e.type)).toEqual(['done']);
  });
});
