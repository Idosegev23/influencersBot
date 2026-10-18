/** Chainable supabase stand-in for the copilot route tests: records every chain, resolves by table. */
export interface Chain { table: string; ops: Array<[string, ...unknown[]]> }

export function makeDb(resolve: (c: Chain) => { data: unknown; error: unknown }) {
  const calls: Chain[] = [];
  const db = {
    from(table: string) {
      const c: Chain = { table, ops: [] };
      calls.push(c);
      const b: any = {};
      for (const m of ['select', 'eq', 'is', 'order', 'limit', 'update', 'insert', 'in', 'neq', 'gte']) {
        b[m] = (...a: unknown[]) => { c.ops.push([m, ...a]); return b; };
      }
      b.maybeSingle = async () => resolve(c);
      b.single = async () => resolve(c);
      b.then = (ok: any, err: any) => Promise.resolve(resolve(c)).then(ok, err);
      return b;
    },
  };
  return { db, calls };
}

export const hasOp = (c: Chain, ...op: unknown[]) => c.ops.some((o) => JSON.stringify(o) === JSON.stringify(op));
