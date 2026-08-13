import { describe, it, expect, vi, beforeEach } from 'vitest';

const runCsTurnCore = vi.fn();
vi.mock('@/lib/cs/cs-agent', () => ({ runCsTurnCore: (...a: any[]) => runCsTurnCore(...a) }));

import { runIgCsTurn } from '@/lib/instagram-graph/dm-cs-adapter';

describe('runIgCsTurn (IG DM adapter, spec M3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('threads an unverified instagram identity + auto-bind into the core', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'text', body: 'היי!' }, phase: 'serving' });
    await runIgCsTurn({ accountId: 'acc-1', igsid: 'ig-777', text: 'איפה ההזמנה?' });
    expect(runCsTurnCore).toHaveBeenCalledWith({
      identity: { channel: 'instagram', igsid: 'ig-777', trust: 'unverified' },
      text: 'איפה ההזמנה?',
      boundAccountId: 'acc-1',
      mode: 'cs',
      language: 'he',
    });
  });

  it('returns reply text + parsed suggestions (IG renders quick replies where WA strips)', async () => {
    runCsTurnCore.mockResolvedValue({
      reply: { kind: 'text', body: 'ההזמנה בדרך!' }, phase: 'serving',
      suggestions: ['תודה', 'פנייה נוספת'],
      payloads: [{ kind: 'order_status_card', order: {} }], // ignored on IG — prose carries it
    });
    const r = await runIgCsTurn({ accountId: 'acc-1', igsid: 'ig-777', text: 'סטטוס?' });
    expect(r).toEqual({ text: 'ההזמנה בדרך!', suggestions: ['תודה', 'פנייה נוספת'] });
  });

  it('a silent turn (paused bot) → empty text, no quick replies', async () => {
    runCsTurnCore.mockResolvedValue({ reply: { kind: 'none' }, phase: 'serving' });
    const r = await runIgCsTurn({ accountId: 'acc-1', igsid: 'ig-777', text: 'הודעה', language: 'en' });
    expect(r).toEqual({ text: '', suggestions: [] });
    expect(runCsTurnCore.mock.calls[0][0].language).toBe('en');
  });
});
