import { describe, it, expect, vi } from 'vitest';
import { runBestieTurn, BESTIE_SYSTEM_PROMPT } from '@/lib/bestie/bestie-agent';

const job = { waId: '972501234567', msg: { id: 'm1' }, textBody: 'כמה זה עולה?', leadId: 'L1' } as any;

const ctx = {
  waId: '972501234567', leadId: 'L1', accountId: 'A1',
  chatSessionId: null, leadName: 'ישראל',
};

const stub = (over: any = {}) => ({
  loadContext: async () => ctx,
  loadHistory: async () => [],
  persistTurn: async () => {},
  ...over,
});

describe('runBestieTurn', () => {
  it('calls a tool, then answers from what it returned', async () => {
    const turns = [
      { toolCalls: [{ id: 't1', name: 'search_bestie_knowledge', args: { query: 'מחיר' } }], text: null },
      { toolCalls: [], text: 'המחיר נקבע לפי היקף. אעביר אותך לאיש מכירות.' },
    ];
    let i = 0;
    const runTool = vi.fn(async () => ({ ok: true, data: { sources: [] } }));

    const result = await runBestieTurn(job, stub({
      callModel: async () => turns[i++] as any,
      runTool,
    }));

    expect(result.reply.kind).toBe('text');
    expect((result.reply as any).body).toContain('איש מכירות');
    expect(runTool).toHaveBeenCalledOnce();
    expect(i).toBe(2);
  });

  it('reports handoff and still acknowledges the lead in the same turn', async () => {
    const turns = [
      { toolCalls: [{ id: 't1', name: 'handoff_to_sales', args: { summary: 'מוכן' } }], text: null },
      { toolCalls: [], text: 'תודה! נציג יחזור אליך.' },
    ];
    let i = 0;

    const result = await runBestieTurn(job, stub({
      callModel: async () => turns[i++] as any,
      runTool: async () => ({ ok: true, handedOff: true }),
    }));

    expect(result.handedOff).toBe(true);
    // Silence right after someone asks to speak to a human reads as being ignored.
    expect(result.reply.kind).toBe('text');
    expect((result.reply as any).body).toBeTruthy();
  });

  it('falls back to a handoff acknowledgement when the model produces no closing text', async () => {
    const result = await runBestieTurn(job, stub({
      callModel: async () => ({ toolCalls: [{ id: 't', name: 'handoff_to_sales', args: {} }], text: null }),
      runTool: async () => ({ ok: true, handedOff: true }),
    }));
    expect(result.handedOff).toBe(true);
    expect((result.reply as any).body).toContain('מכירות');
  });

  it('stops instead of looping forever when the model keeps calling tools', async () => {
    const callModel = vi.fn(async () => ({
      toolCalls: [{ id: 't', name: 'search_bestie_knowledge', args: {} }],
      text: null,
    }));

    const result = await runBestieTurn(job, stub({
      callModel,
      runTool: async () => ({ ok: true, data: {} }),
    }));

    expect(callModel.mock.calls.length).toBeLessThanOrEqual(5);
    expect(result.reply.kind).toBe('text');
  });

  it('says nothing when there is no text to answer', async () => {
    const result = await runBestieTurn({ ...job, textBody: '   ' }, stub({
      callModel: async () => { throw new Error('must not be called'); },
    }));
    expect(result.reply.kind).toBe('none');
  });

  it('survives a tool that fails without dropping the conversation', async () => {
    const turns = [
      { toolCalls: [{ id: 't1', name: 'search_bestie_knowledge', args: {} }], text: null },
      { toolCalls: [], text: 'לא הצלחתי למצוא, אבל אשמח לחבר אותך לאדם.' },
    ];
    let i = 0;
    const result = await runBestieTurn(job, stub({
      callModel: async () => turns[i++] as any,
      runTool: async () => ({ ok: false, data: { reason: 'tool_error' } }),
    }));
    expect((result.reply as any).body).toContain('אדם');
  });
});

describe('the system prompt', () => {
  it('forbids prices unconditionally', () => {
    expect(BESTIE_SYSTEM_PROMPT).toContain('לעולם אל תנקבי במחיר');
    // The dangerous phrasings a polite bot slides into.
    expect(BESTIE_SYSTEM_PROMPT).toContain('טווח');
    expect(BESTIE_SYSTEM_PROMPT).toContain('מתחיל מ');
  });

  it('draws the boundary at other customers and internals', () => {
    expect(BESTIE_SYSTEM_PROMPT).toContain('לקוחות אחרים');
    expect(BESTIE_SYSTEM_PROMPT).toContain('מבפנים');
  });
});
