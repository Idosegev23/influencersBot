import { describe, it, expect } from 'vitest';
import { runAgentBrain, isAdvisoryIntent } from '@/lib/crm/agent-brain';

describe('isAdvisoryIntent', () => {
  it('classifies analytics/Q&A as advisory, money actions as not', () => {
    expect(isAdvisoryIntent('answer')).toBe(true);
    expect(isAdvisoryIntent('analytics')).toBe(true);
    expect(isAdvisoryIntent('issue_quote')).toBe(false);
    expect(isAdvisoryIntent('price')).toBe(false);
  });
});

describe('runAgentBrain loop', () => {
  it('runs a tool then produces the final answer, and never calls a mutating tool', async () => {
    const turns = [
      { toolCalls: [{ name: 'count_contracts', args: { talentId: 't-anna' } }], text: null }, // 1st: ask for a tool
      { toolCalls: [], text: 'לאנה יש 14 עסקאות.' },                                            // 2nd: final
    ];
    let i = 0;
    const callModel = async () => turns[i++] as any;
    // Patch runTool via a sb whose partnerships resolves 14 rows:
    const sb: any = {
      from: () => {
        const rows = Array.from({ length: 14 }, () => ({ agent_id: 'A', account_id: 't-anna', status: 'signed' }));
        const api: any = {
          select: () => api, eq: () => api, in: () => api, gte: () => api, order: () => api, limit: () => api,
          maybeSingle: async () => ({ data: rows[0] }), then: (r: any) => r({ data: rows }),
        };
        return api;
      },
      rpc: async () => ({ data: [] }),
    };
    const out = await runAgentBrain({
      callModel,
      sb,
      agent: { id: 'A', managed_account_ids: ['t-anna'] } as any,
      text: 'כמה עסקאות לאנה?',
      memory: { rollingSummary: '', lastResponseId: null, turnCount: 0, recentTurns: [] },
    });
    expect(out.reply).toContain('14');
    expect(out.toolCalls.map(t => t.name)).toEqual(['count_contracts']);
  });

  it('stops at the iteration cap and returns whatever text it has', async () => {
    const callModel = async () => ({ toolCalls: [{ name: 'pipeline_status', args: {} }], text: null } as any); // never finishes
    const sb: any = {
      from: () => {
        const api: any = {
          select: () => api, eq: () => api, in: () => api, gte: () => api, order: () => api, limit: () => api,
          maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [] }),
        };
        return api;
      },
      rpc: async () => ({ data: [] }),
    };
    const out = await runAgentBrain({
      callModel,
      sb,
      agent: { id: 'A' } as any,
      text: 'מה קורה?',
      memory: { rollingSummary: '', lastResponseId: null, turnCount: 0, recentTurns: [] },
    });
    expect(out.toolCalls.length).toBeLessThanOrEqual(4);
    expect(typeof out.reply).toBe('string');
  });
});
