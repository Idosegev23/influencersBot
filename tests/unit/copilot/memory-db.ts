/**
 * In-memory supabase stand-in with real filtering, for the console tests that
 * depend on conditional updates (attempt counting, single-use codes) and on
 * rollback (rows really disappear). Supports the subset the console code uses.
 */
type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export interface MemoryDb {
  tables: Record<string, Row[]>;
  rpcs: Record<string, (args: any) => { data: any; error: any } | Promise<{ data: any; error: any }>>;
  /** Make the next operation on a table (optionally of one kind) fail. */
  failNext: Array<{ table: string; op?: 'select' | 'insert' | 'update' | 'delete'; error: any }>;
  log: Array<{ table: string; op: string; row?: Row; patch?: Row }>;
  from(table: string): any;
  rpc(name: string, args: any): Promise<{ data: any; error: any }>;
}

let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function get(r: Row, col: string): any {
  // `metadata->copilot->>x` style paths
  const parts = col.split(/->>?/);
  let v: any = r;
  for (const p of parts) v = v == null ? undefined : v[p];
  return v;
}

export function memoryDb(seed: Record<string, Row[]> = {}): MemoryDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const db: MemoryDb = {
    tables, rpcs: {}, failNext: [], log: [],
    rpc: async (name, args) => {
      const f = db.rpcs[name];
      if (!f) return { data: null, error: { message: `no rpc ${name}` } };
      return f(args);
    },
    from(table: string) {
      const rows = (tables[table] ??= []);
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let patch: Row | null = null;
      let inserted: Row[] = [];
      let returning = false;
      const filters: Filter[] = [];
      let order: { col: string; asc: boolean } | null = null;
      let limit = Infinity;
      let range: [number, number] | null = null;

      const failure = () => {
        const i = db.failNext.findIndex((f) => f.table === table && (!f.op || f.op === op));
        if (i < 0) return null;
        const [f] = db.failNext.splice(i, 1);
        return f.error;
      };

      const run = (): { data: any; error: any } => {
        const err = failure();
        if (err) return { data: null, error: err };
        if (op === 'insert') {
          const out = inserted.map((r) => ({ id: r.id ?? nextId(), created_at: r.created_at ?? new Date().toISOString(), ...r }));
          rows.push(...out);
          out.forEach((r) => db.log.push({ table, op: 'insert', row: r }));
          return { data: returning ? out : null, error: null };
        }
        let hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          hit.forEach((r) => Object.assign(r, patch));
          db.log.push({ table, op: 'update', patch: patch! });
          return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
        }
        if (op === 'delete') {
          for (const r of hit) rows.splice(rows.indexOf(r), 1);
          db.log.push({ table, op: 'delete' });
          return { data: returning ? hit : null, error: null };
        }
        if (order) {
          const { col, asc } = order;
          hit = [...hit].sort((a, b) => (get(a, col) < get(b, col) ? -1 : get(a, col) > get(b, col) ? 1 : 0) * (asc ? 1 : -1));
        }
        if (range) hit = hit.slice(range[0], range[1] + 1);
        hit = hit.slice(0, limit);
        return { data: hit.map((r) => ({ ...r })), error: null };
      };

      const b: any = {
        select: () => { if (op !== 'select') returning = true; return b; },
        insert: (r: Row | Row[]) => { op = 'insert'; inserted = Array.isArray(r) ? r : [r]; return b; },
        update: (p: Row) => { op = 'update'; patch = p; return b; },
        delete: () => { op = 'delete'; return b; },
        eq: (c: string, v: any) => { filters.push((r) => { const x = get(r, c); return x === v || (x != null && v != null && String(x) === String(v)); }); return b; },
        neq: (c: string, v: any) => { filters.push((r) => get(r, c) !== v); return b; },
        is: (c: string, v: any) => { filters.push((r) => (get(r, c) ?? null) === v); return b; },
        in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(get(r, c))); return b; },
        gte: (c: string, v: any) => { filters.push((r) => get(r, c) >= v); return b; },
        lt: (c: string, v: any) => { filters.push((r) => get(r, c) < v); return b; },
        like: (c: string, v: string) => { const re = new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'); filters.push((r) => re.test(String(get(r, c) ?? ''))); return b; },
        ilike: (c: string, v: string) => { const re = new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); filters.push((r) => re.test(String(get(r, c) ?? ''))); return b; },
        order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return b; },
        limit: (n: number) => { limit = n; return b; },
        range: (a: number, z: number) => { range = [a, z]; return b; },
        maybeSingle: async () => { const r = run(); if (r.error) return r; const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
        single: async () => { const r = run(); if (r.error) return r; const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return d ? { data: d, error: null } : { data: null, error: { message: 'no rows' } }; },
        then: (ok: any, bad: any) => Promise.resolve().then(run).then(ok, bad),
      };
      return b;
    },
  };
  return db;
}
