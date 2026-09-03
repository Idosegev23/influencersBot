/**
 * Live check for the shared-number brand bind (fix f62d0a56).
 *
 * The unit tests mock the DB and the model, so nothing in the suite proves the thing that actually
 * broke: that the REAL prompt, built from the REAL roster, makes the REAL model emit bind_brand with
 * an accountId `accounts.id` accepts. For six weeks it emitted "ARGANIA GROUP", PostgREST answered
 * 400/22P02, and 103 conversations never bound.
 *
 * THIS RUNS AGAINST PRODUCTION, so it must not be able to touch a brand or a shopper. A global
 * fetch guard allows exactly two things — Supabase reads (GET/HEAD) and the OpenAI completion under
 * test — and THROWS on everything else. Nothing can be written, no ticket opened, no escalation
 * dispatched, no WhatsApp message sent: not by policy, by construction. Blocked attempts are
 * counted and printed, so a silently-skipped write can't pass for a clean run.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/cs-brand-bind-e2e.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

// ---------------------------------------------------------------------------
// The guard. Installed BEFORE any src/ module is imported, so every client built
// downstream (supabase-js, the OpenAI SDK, the WhatsApp client) inherits it.
// ---------------------------------------------------------------------------
const blocked: string[] = [];
const allowedReads: string[] = [];
const realFetch = globalThis.fetch;
const SUPABASE_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : (input?.url ?? String(input)));
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  const label = `${method} ${url.host}${url.pathname}`;

  const isSupabaseRead = url.host === SUPABASE_HOST && (method === 'GET' || method === 'HEAD');
  const isModelCall = url.host === 'api.openai.com' && url.pathname === '/v1/chat/completions';

  if (isSupabaseRead || isModelCall) {
    if (isSupabaseRead) allowedReads.push(label);
    return realFetch(input, init);
  }
  blocked.push(label);
  throw new Error(`[guard] BLOCKED ${label} — this script is read-only against production`);
}) as typeof fetch;

const ARGANIA_NAME = 'ARGANIA GROUP';
let failures = 0;
function check(name: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!pass) failures++;
}

async function main() {
  const { listCsEnabledBrands } = await import('../src/lib/cs/brand-resolver');
  const { buildCsSystemPrompt } = await import('../src/lib/cs/cs-context');
  const { buildCsToolset } = await import('../src/lib/cs/tools/registry');
  const { getCsTools } = await import('../src/lib/cs/tools');
  const { laneModel } = await import('../src/lib/llm/config');

  const brands = await listCsEnabledBrands();
  console.log(`\nCS-enabled brands live: ${brands.length}`);
  for (const b of brands) console.log(`  ${b.displayName} → ${b.accountId}`);
  const argania = brands.find((b) => b.displayName === ARGANIA_NAME);
  if (!argania) throw new Error(`${ARGANIA_NAME} is not CS-enabled — this script assumes it is`);

  // -- 1. The prompt the shared number actually builds ------------------------
  console.log('\n1. Real unbound system prompt');
  const digest = {
    knownName: 'פנינה', boundBrand: null, warm: true, mode: 'cs' as const, language: 'he' as const,
    openThreads: [], policy: null, hasContactRoute: true,
    // פנינה's conversation, exactly as whatsapp_cs_sessions held it when the bot said
    // "נראה שיש תקלה בחיבור ל-ARGANIA GROUP" — replayed up to the turn that had to bind.
    recentTurns: [
      { role: 'user' as const, text: 'קוראים לי פנינה ורציתי לדעת אם יש לכם שמפו יבש' },
      { role: 'assistant' as const, text: 'נעים מאוד, פנינה. בשמחה אבדוק — באיזה מותג מדובר, STUDIO PASHA או ARGANIA GROUP?' },
      { role: 'user' as const, text: 'ארגניה' },
      { role: 'assistant' as const, text: 'פנינה, מדובר ב‑ARGANIA GROUP באתר argania-oil.co.il?' },
    ],
  };
  const prompt = await buildCsSystemPrompt({ accountId: null, userMessage: 'כן', digest });
  const rosterLines = prompt.split('\n').filter((l) => brands.some((b) => l.startsWith(b.displayName)));
  for (const l of rosterLines) console.log(`     ${l}`);
  check('every roster line carries its brand\'s real accountId',
    brands.every((b) => rosterLines.some((l) => l.startsWith(b.displayName) && l.includes(b.accountId))));

  // -- 2. The gate, against the real accounts table ---------------------------
  console.log('\n2. Real bind_brand against production (writes blocked by the guard)');
  const bind = getCsTools().find((t) => t.def.function.name === 'bind_brand')!;
  const ctx: any = {
    waId: '000000000000', accountId: null, chatSessionId: null, ticketId: null, customerName: null,
    identity: { channel: 'whatsapp', waId: '000000000000', trust: 'channel_verified' },
  };
  const cases: Array<[string, string, 'bind' | 'refuse']> = [
    [argania.accountId, 'the roster uuid — what the fixed prompt hands the model', 'bind'],
    [ARGANIA_NAME, 'the brand NAME — what the model sent for six weeks', 'bind'],
    [argania.domain || '', 'the domain', 'bind'],
    ['argania', 'a PARTIAL name — must never be guessed at between tenants', 'refuse'],
    ['לא קיים כזה מותג', 'a brand we do not serve', 'refuse'],
  ];
  for (const [ref, why, expected] of cases) {
    const r: any = await bind.handler({ accountId: ref }, { ...ctx });
    const boundTo = r.bind?.accountId ?? null;
    const ok = expected === 'bind' ? boundTo === argania.accountId : (!r.ok && !r.bind);
    check(`${expected === 'bind' ? 'binds' : 'refuses'}: "${ref}" — ${why}`, ok,
      `→ ${r.ok ? `ok, bound ${boundTo}` : `refused: ${r.data?.reason}`}`);
  }

  // -- 3. The model. This is the behaviour that broke. ------------------------
  console.log('\n3. Real model on the real prompt (this is what actually regressed)');
  const toolset = buildCsToolset({ channel: 'whatsapp', account: null, preBoundAccountId: null });
  const model = laneModel('money');
  console.log(`   model: ${model}, tools: ${toolset.defs.length}`);

  // Mirrors defaultCallModel() in src/lib/cs/cs-agent.ts — same model, tools and params.
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const askModel = async (system: string, tools: any = toolset.defs) => {
    const res = await openai.chat.completions.create({
      model, tools, tool_choice: 'auto', reasoning_effort: 'none',
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'כן' }],
    } as any);
    const msg: any = res.choices?.[0]?.message;
    return (msg?.tool_calls || []).map((tc: any) => ({
      name: tc.function?.name,
      args: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
    }));
  };

  // The pre-fix prompt, reconstructed from the shipped one by removing exactly what the fix added:
  // the accountId on each roster line, and the line telling the model to pass it verbatim.
  const oldPrompt = prompt
    .split('\n').filter((l) => !l.startsWith('כל שורה: שם — אתר — accountId'))
    .join('\n').replace(/ — accountId: [0-9a-f-]{36}/g, '');

  // ONE sample proves nothing here: the bug was never deterministic. 144 conversations bound and
  // 103 did not, because the old prompt sometimes sent the model to resolve_brand (which returns a
  // real uuid, so it recovered) and sometimes let it bind straight off the roster with a NAME. So
  // both prompts are sampled N times and reported as a rate.
  const N = Number(process.env.SAMPLES || 6);
  const sample = async (system: string, label: string, tools?: any) => {
    const outcomes: string[] = [];
    for (let i = 0; i < N; i++) {
      const calls = await askModel(system, tools);
      const b = calls.find((c: any) => c.name === 'bind_brand');
      outcomes.push(
        b ? (b.args?.accountId === argania.accountId ? 'bind:uuid' : `bind:BAD(${b.args?.accountId})`)
          : calls.find((c: any) => c.name === 'resolve_brand') ? 'resolve_brand'
          : calls.length ? calls.map((c: any) => c.name).join('+') : 'no-tool-call');
    }
    const tally = outcomes.reduce((m: any, o) => ((m[o] = (m[o] || 0) + 1), m), {});
    console.log(`   ${label}: ${JSON.stringify(tally)}`);
    return outcomes;
  };

  // A bad bind is the actual defect. resolve_brand is a correct recovery — the old prompt's problem
  // is that whether it recovered was a coin flip, and a bad bind was unrecoverable and invisible.
  // The fix touched the bind_brand ARG DESCRIPTION too ("a uuid… NEVER the display name"). Sampling
  // the old prompt against the NEW tool defs would let that nudge leak into the "before" arm and
  // flatter the result — so the pre-fix tool defs are reconstructed as well.
  const oldDefs = JSON.parse(JSON.stringify(toolset.defs));
  const oldBind = oldDefs.find((d: any) => d.function.name === 'bind_brand');
  delete oldBind.function.parameters.properties.accountId.description;

  const before = await sample(oldPrompt, 'BEFORE (roster without accountId)', oldDefs);
  const badBefore = before.filter((o) => o.startsWith('bind:BAD')).length;
  check(`the old prompt still emits an unusable bind (${badBefore}/${N}) — the regression reproduces`, badBefore > 0,
    badBefore === 0 ? '(not reproduced this run — it is a coin flip, see the tally)' : '');

  const after = await sample(prompt, 'AFTER  (shipped prompt)           ');
  const badAfter = after.filter((o) => o.startsWith('bind:BAD')).length;
  const goodAfter = after.filter((o) => o === 'bind:uuid').length;
  check(`the shipped prompt NEVER emits a bad bind (0/${N})`, badAfter === 0);
  check(`the shipped prompt binds by the real accountId (${goodAfter}/${N}; the rest go via resolve_brand, also correct)`, goodAfter > 0);

  // -- Proof the guard held ---------------------------------------------------
  console.log(`\nGuard: ${allowedReads.length} reads allowed, ${blocked.length} writes/sends BLOCKED`);
  for (const b of Array.from(new Set(blocked))) console.log(`   blocked: ${b}`);
  console.log(failures === 0 ? '\nPASS\n' : `\nFAIL — ${failures} check(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
