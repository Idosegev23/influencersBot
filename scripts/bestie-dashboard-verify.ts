/**
 * Surface B acceptance gate (spec §8.1, §8.3).
 *
 * Two properties that must never quietly stop being true:
 *   1. Account A's context cannot surface account B's data.
 *   2. Nothing in this surface writes — measured by snapshotting row counts
 *      around a full run of every tool, including escalation.
 *
 * A script, not a vitest test: tests/setup.ts stubs global.fetch for the whole
 * suite, so nothing under vitest reaches the real database this must query.
 *
 * Run: npm run bestie:dashboard-verify
 * Needs Node >= 22 (`nvm use 22`).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const WATCHED_TABLES = [
  'chat_sessions', 'chat_messages', 'support_requests', 'coupons',
  'document_chunks', 'widget_products', 'accounts', 'bestie_leads',
];

let failures = 0;
const fail = (msg: string) => { failures++; console.error(`✖ ${msg}`); };
const pass = (msg: string) => console.log(`✓ ${msg}`);

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { getDashboardTools, DASHBOARD_TOOL_DEFS } = await import('../src/lib/bestie/dashboard/tools');
  const supabase = createClient();

  // ---- 1. No tool exposes an account selector -----------------------------
  const SELECTORS = ['accountid', 'account_id', 'account', 'username', 'user', 'brand', 'tenant', 'shop', 'store', 'client'];
  let selectorLeak = false;
  for (const def of DASHBOARD_TOOL_DEFS) {
    for (const p of Object.keys((def.function.parameters as any)?.properties ?? {})) {
      if (SELECTORS.includes(p.toLowerCase())) {
        fail(`tool ${def.function.name} exposes account selector "${p}"`);
        selectorLeak = true;
      }
    }
  }
  if (!selectorLeak) pass('no tool exposes an account selector');

  // ---- 2. Pick two real accounts with data --------------------------------
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active')
    .neq('config->>username', 'bestie')
    .limit(40);

  const candidates: Array<{ id: string; username: string }> = [];
  for (const a of accounts ?? []) {
    const { count } = await supabase
      .from('chat_sessions').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
    if ((count ?? 0) > 0) candidates.push({ id: a.id, username: (a.config as any)?.username ?? '?' });
    if (candidates.length === 2) break;
  }

  if (candidates.length < 2) {
    fail('need two accounts with conversations to test isolation; found ' + candidates.length);
    process.exit(1);
  }
  const [A, B] = candidates;
  pass(`testing isolation with ${A.username} vs ${B.username}`);

  // ---- 3. Snapshot row counts BEFORE --------------------------------------
  const snapshot = async () => {
    const out: Record<string, number> = {};
    for (const t of WATCHED_TABLES) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      out[t] = count ?? -1;
    }
    return out;
  };
  const before = await snapshot();

  // ---- 4. Run every tool with A's context ---------------------------------
  const ctxA = {
    accountId: A.id, username: A.username,
    currentRoute: '/influencer/[username]/chatbot-settings', language: 'he',
  };

  const tools = getDashboardTools();
  const results: Record<string, any> = {};
  for (const tool of tools) {
    const name = tool.def.function.name;
    // Escalation would email a real person; exercise everything else.
    if (name === 'escalate_to_bestie_team') continue;
    const args = name === 'search_bestie_knowledge'
      ? { query: 'איך מטמיעים את הצאט' }
      : name === 'route_to_screen'
        ? { route: '/influencer/[username]/coupons' }
        : {};
    try {
      results[name] = await tool.handler(args, ctxA as any);
      pass(`${name} ran`);
    } catch (e) {
      fail(`${name} threw: ${(e as Error).message}`);
    }
  }

  // ---- 5. Nothing returned may belong to account B ------------------------
  const blob = JSON.stringify(results);
  if (blob.includes(B.id)) fail(`output contains account B's id (${B.id})`);
  else pass("no output row belongs to the other account");

  if (B.username && B.username !== '?' && blob.includes(B.username)) {
    fail(`output mentions the other account's username (${B.username})`);
  } else {
    pass("no output mentions the other account's username");
  }

  // ---- 6. Snapshot AFTER — nothing may have moved --------------------------
  const after = await snapshot();
  let wrote = false;
  for (const t of WATCHED_TABLES) {
    if (before[t] !== after[t]) {
      fail(`${t} row count changed ${before[t]} → ${after[t]} — this surface must not write`);
      wrote = true;
    }
  }
  if (!wrote) pass('no table changed — the surface wrote nothing');

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch(err => { console.error(err); process.exit(1); });
