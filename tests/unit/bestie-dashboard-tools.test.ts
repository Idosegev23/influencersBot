import { describe, it, expect } from 'vitest';
import { DASHBOARD_TOOL_DEFS, getDashboardTools } from '@/lib/bestie/dashboard/tools';

// Spec §4.1 — the model must have no way to *express* "read another account".
const ACCOUNT_SELECTORS = [
  'accountid', 'account_id', 'account', 'username', 'user',
  'brand', 'tenant', 'shop', 'store', 'client',
];

describe('dashboard tool definitions', () => {
  it('exposes exactly the six read-only tools', () => {
    expect(DASHBOARD_TOOL_DEFS.map(d => d.function.name).sort()).toEqual([
      'escalate_to_bestie_team',
      'find_knowledge_gaps',
      'read_account_pulse',
      'route_to_screen',
      'run_health_check',
      'search_bestie_knowledge',
    ]);
  });

  it('NO tool accepts an account selector as a parameter', () => {
    for (const def of DASHBOARD_TOOL_DEFS) {
      const params = Object.keys((def.function.parameters as any)?.properties ?? {});
      for (const p of params) {
        expect(
          ACCOUNT_SELECTORS.includes(p.toLowerCase()),
          `${def.function.name} exposes "${p}" — the model could then name another account`
        ).toBe(false);
      }
    }
  });

  it('has a handler for every definition and no orphan handlers', () => {
    const defNames = DASHBOARD_TOOL_DEFS.map(d => d.function.name).sort();
    const toolNames = getDashboardTools().map(t => t.def.function.name).sort();
    expect(toolNames).toEqual(defNames);
  });

  it('names no mutating verb in any tool', () => {
    const forbidden = /(^|_)(create|update|delete|write|set|add|remove|save|pause|toggle)(_|$)/;
    for (const def of DASHBOARD_TOOL_DEFS) {
      expect(forbidden.test(def.function.name), `${def.function.name} looks mutating`).toBe(false);
    }
  });

  it('gives the three account-reading tools no parameters at all', () => {
    // Nothing to fill in means nothing to smuggle an account into.
    for (const name of ['read_account_pulse', 'find_knowledge_gaps', 'run_health_check']) {
      const def = DASHBOARD_TOOL_DEFS.find(d => d.function.name === name)!;
      expect(Object.keys((def.function.parameters as any).properties ?? {})).toEqual([]);
    }
  });
});
