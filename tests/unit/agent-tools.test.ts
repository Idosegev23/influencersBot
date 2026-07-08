import { describe, it, expect, vi } from 'vitest';
import { countContracts, sumSales, pipelineStatus, runTool, AGENT_TOOL_SCHEMAS } from '@/lib/crm/agent-tools';

// Minimal chainable fake: records every .eq() and resolves to canned rows.
function fakeSb(tableRows: Record<string, any[]>) {
  const eqCalls: [string, string, any][] = [];
  const make = (table: string) => {
    let rows = tableRows[table] || [];
    const filtered: [string, any][] = [];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { eqCalls.push([table, col, val]); filtered.push([col, val]); rows = rows.filter(r => r[col] === val); return api; },
      in: (col: string, vals: any[]) => { rows = rows.filter(r => vals.includes(r[col])); return api; },
      gte: () => api, lte: () => api, order: () => api, limit: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (res: any) => res({ data: rows, count: rows.length, error: null }), // await support
    };
    return api;
  };
  return { from: (t: string) => make(t), _eqCalls: eqCalls };
}

describe('agent-tools scope every query by agent_id', () => {
  it('countContracts filters agent_id and counts', async () => {
    const sb = fakeSb({ partnerships: [
      { id: '1', agent_id: 'A', status: 'signed' },
      { id: '2', agent_id: 'A', status: 'proposal' },
      { id: '3', agent_id: 'B', status: 'signed' },
    ]});
    const r = await countContracts(sb as any, 'A');
    expect(r.count).toBe(2);
    expect(sb._eqCalls.some(([t, c, v]) => t === 'partnerships' && c === 'agent_id' && v === 'A')).toBe(true);
  });
  it('sumSales sums contract_amount for the agent only', async () => {
    const sb = fakeSb({ partnerships: [
      { agent_id: 'A', status: 'signed', contract_amount: 80000, proposal_amount: 80000, currency: 'ILS' },
      { agent_id: 'A', status: 'signed', contract_amount: 20000, proposal_amount: 20000, currency: 'ILS' },
      { agent_id: 'B', status: 'signed', contract_amount: 999, proposal_amount: 999, currency: 'ILS' },
    ]});
    const r = await sumSales(sb as any, 'A', { signedOnly: true });
    expect(r.total).toBe(100000);
    expect(r.count).toBe(2);
  });
  it('runTool rejects an unknown tool', async () => {
    await expect(runTool(fakeSb({}) as any, 'A', 'delete_everything', {})).rejects.toThrow();
  });
  it('exposes no mutating tool in the schema', () => {
    const names = AGENT_TOOL_SCHEMAS.map(s => s.name);
    expect(names.some(n => /issue|send|create|update|delete|cancel/i.test(n))).toBe(false);
  });
});
