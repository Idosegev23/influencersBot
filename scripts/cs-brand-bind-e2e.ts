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

  // PostgREST sends read-only RPCs as POST, so an allowlisted search function has to be named
  // explicitly. Blocking it doesn't just lose coverage — it silently downgrades the RAG check to
  // the "recent posts" fallback, so the check passes on the wrong content.
  const isSupabaseRead = url.host === SUPABASE_HOST
    && ((method === 'GET' || method === 'HEAD')
      || (method === 'POST' && url.pathname === '/rest/v1/rpc/search_all_content'));
  const isModelCall = url.host === 'api.openai.com' && url.pathname === '/v1/chat/completions';

  if (isSupabaseRead || isModelCall) {
    if (isSupabaseRead) allowedReads.push(label);
    return realFetch(input, init);
  }
  blocked.push(label);
  throw new Error(`[guard] BLOCKED ${label} — this script is read-only against production`);
}) as typeof fetch;

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
  // Driven by the LIVE roster, so a brand added later is covered without editing this file.
  console.log('\n2. Real bind_brand against production (writes blocked by the guard)');
  const bind = getCsTools().find((t) => t.def.function.name === 'bind_brand')!;
  const ctx: any = {
    waId: '000000000000', accountId: null, chatSessionId: null, ticketId: null, customerName: null,
    identity: { channel: 'whatsapp', waId: '000000000000', trust: 'channel_verified' },
  };
  const bindsTo = async (ref: string) => {
    const r: any = await bind.handler({ accountId: ref }, { ...ctx });
    return { id: r.bind?.accountId ?? null, reason: r.data?.reason };
  };
  for (const b of brands) {
    console.log(`   ${b.displayName}`);
    for (const ref of [b.accountId, b.displayName, b.domain].filter(Boolean) as string[]) {
      const got = await bindsTo(ref);
      const kind = ref === b.accountId ? 'uuid' : ref === b.displayName ? 'name' : 'domain';
      check(`binds by ${kind}: "${ref}"`, got.id === b.accountId, `→ ${got.id ?? `refused: ${got.reason}`}`);
    }
    // No brand may be reachable by another brand's name — the whole point of the CS-enabled gate.
    for (const other of brands.filter((o) => o.accountId !== b.accountId)) {
      const got = await bindsTo(other.displayName);
      check(`  "${other.displayName}" does NOT bind ${b.displayName}`, got.id !== b.accountId);
    }
  }
  for (const [ref, why] of [['argania', 'a PARTIAL name — never guessed at between tenants'],
                            ['לא קיים כזה מותג', 'a brand we do not serve']] as [string, string][]) {
    const got = await bindsTo(ref);
    check(`refuses: "${ref}" — ${why}`, got.id === null, `→ ${got.reason}`);
  }

  // -- 3. The model. This is the behaviour that broke. ------------------------
  console.log('\n3. Real model on the real prompt (this is what actually regressed)');
  const toolset = buildCsToolset({ channel: 'whatsapp', account: null, preBoundAccountId: null });
  const model = laneModel('money');
  console.log(`   model: ${model}, tools: ${toolset.defs.length}`);

  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // Mirrors defaultCallModel() in src/lib/cs/cs-agent.ts — same model, tools and params.
  const askModel = async (system: string, userText: string, tools: any = toolset.defs) => {
    const res = await openai.chat.completions.create({
      model, tools, tool_choice: 'auto', reasoning_effort: 'none',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userText }],
    } as any);
    const msg: any = res.choices?.[0]?.message;
    const calls = (msg?.tool_calls || []).map((tc: any) => ({
      name: tc.function?.name,
      args: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
    }));
    // The reply TEXT rides along: "no tool call" is not an outcome, it is an unread answer, and
    // what the shopper is told is the whole point.
    (calls as any).text = msg?.content ?? '';
    return calls;
  };

  // ONE sample proves nothing: the bug was never deterministic. 144 conversations bound and 103 did
  // not, because the old prompt sometimes sent the model to resolve_brand (which returns a real
  // uuid, so it recovered) and sometimes let it bind straight off the roster with a NAME.
  const N = Number(process.env.SAMPLES || 6);
  const sample = async (system: string, userText: string, want: string, label: string, tools?: any) => {
    const outcomes: string[] = [];
    for (let i = 0; i < N; i++) {
      const calls = await askModel(system, userText, tools);
      const b = calls.find((c: any) => c.name === 'bind_brand');
      outcomes.push(
        b ? (b.args?.accountId === want ? 'bind:right' : `bind:WRONG(${b.args?.accountId})`)
          : calls.find((c: any) => c.name === 'resolve_brand') ? 'resolve_brand'
          : calls.length ? calls.map((c: any) => c.name).join('+') : 'no-tool-call');
    }
    const tally = outcomes.reduce((m: any, o) => ((m[o] = (m[o] || 0) + 1), m), {});
    console.log(`   ${label}: ${JSON.stringify(tally)}`);
    return outcomes;
  };

  // Each brand gets the turn a real shopper reached it with — the confirmation right before the
  // bind, which is exactly where the uuid used to go missing.
  // Keyed by DOMAIN, not display_name: a styled name (𝐋𝐀 𝐁𝐄𝐀𝐔𝐓𝐄) is not something to retype by hand.
  const REPLAYS: Array<{ domain: string; said: string; turns: [string, string][] }> = [
    { domain: 'argania-oil.co.il', said: 'כן', turns: [
      ['user', 'קוראים לי פנינה ורציתי לדעת אם יש לכם שמפו יבש'],
      ['assistant', 'נעים מאוד, פנינה. בשמחה אבדוק — באיזה מותג מדובר?'],
      ['user', 'ארגניה'],
      ['assistant', 'פנינה, מדובר ב‑ARGANIA GROUP באתר argania-oil.co.il?'] ] },
    // לירון, 06/09 — turned away because LA BEAUTÉ was not on the roster.
    { domain: 'labeauteisrael.co.il', said: 'כן', turns: [
      ['user', 'אשמח למענה 🙏🏻'],
      ['assistant', 'היי! אני בסטי 🙂 איך קוראים לך, ולאיזה מותג דרושה לך עזרה?'],
      ['user', 'לירון, מותג: לה בוטה, מספר הזמנה: 10202920'],
      ['assistant', 'תודה לירון. מדובר ב‑LA BEAUTE באתר labeauteisrael.co.il?'] ] },
    { domain: 'studiopasha.co.il', said: 'כן', turns: [
      ['user', 'היי מה קורה עם הפניה שלי?'],
      ['assistant', 'היי! אשמח לבדוק 🙂 לאיזה מותג הפנייה קשורה?'],
      ['user', 'סטודיו פשה'],
      ['assistant', 'מדובר ב‑STUDIO PASHA (studiopasha.co.il), נכון?'] ] },
  ];

  let firstPrompt: string | null = null;
  for (const rep of REPLAYS) {
    const want = brands.find((b) => b.domain === rep.domain);
    if (!want) { check(`replay target ${rep.domain} is on the roster`, false); continue; }
    const d = { ...digest, recentTurns: rep.turns.map(([role, text]) => ({ role, text })) as any };
    const sys = await buildCsSystemPrompt({ accountId: null, userMessage: rep.said, digest: d as any });
    firstPrompt ??= sys;
    const out = await sample(sys, rep.said, want.accountId, `${want.displayName} — replay of a real stuck turn`);
    check(`${want.displayName}: never binds the WRONG brand (0/${N})`, out.every((o) => !o.startsWith('bind:WRONG')));
    check(`${want.displayName}: binds the right accountId (${out.filter((o) => o === 'bind:right').length}/${N}; resolve_brand is also correct)`,
      out.some((o) => o === 'bind:right' || o === 'resolve_brand'));
  }

  // The pre-fix prompt, reconstructed from the shipped one by removing exactly what the fix added.
  // The fix touched the bind_brand ARG DESCRIPTION too, so those defs are reconstructed as well —
  // leaving the new one in made the old prompt look fine (0/6 bad), a false pass.
  const oldPrompt = firstPrompt!
    .split('\n').filter((l) => !l.startsWith('כל שורה: שם — אתר — accountId'))
    .join('\n').replace(/ — accountId: [0-9a-f-]{36}/g, '');
  const oldDefs = JSON.parse(JSON.stringify(toolset.defs));
  delete oldDefs.find((d: any) => d.function.name === 'bind_brand').function.parameters.properties.accountId.description;
  const argania = brands.find((b) => b.displayName === 'ARGANIA GROUP')!;
  const before = await sample(oldPrompt, 'כן', argania.accountId, 'BEFORE (pre-fix prompt + pre-fix tool defs)', oldDefs);
  const bad = before.filter((o) => o.startsWith('bind:WRONG')).length;
  check(`the pre-fix build still emits an unusable bind (${bad}/${N}) — the regression reproduces`, bad > 0,
    bad === 0 ? '(not reproduced this run — it is a coin flip, see the tally)' : '');

  // -- 4. Post-bind: is the brand actually SERVICEABLE once bound? -------------
  // Binding is only the door. A brand behind it with no knowledge, no policy and no reachable human
  // just moves the failure one turn later — which is exactly what "I'll pass you to a human" did
  // for six weeks. All read-only: the prompt builder and resolveRecipients only SELECT.
  console.log('\n4. Post-bind readiness per brand');
  const { supabase } = await import('../src/lib/supabase');
  const { resolveRecipients } = await import('../src/engines/escalation/recipients');
  const { searchContentByQuery } = await import('../src/lib/chatbot/hybrid-retrieval');

  for (const b of brands) {
    const { data: acct } = await supabase.from('accounts').select('config').eq('id', b.accountId).single();
    const cfg = (acct as any)?.config || {};
    console.log(`\n   ${b.displayName}`);

    // Tool availability is cut in code at registry build — an account with no orders provider must
    // never be OFFERED an order tool it can only refuse.
    const ts = buildCsToolset({ channel: 'whatsapp', account: { archetype: cfg.archetype, config: cfg }, preBoundAccountId: null });
    const names = ts.defs.map((d: any) => d.function.name);
    const hasOrders = Boolean(cfg?.integrations?.quickshop?.api_key || cfg?.integrations?.shopify?.admin_api_token);
    check(`order tools offered === has an orders provider (${hasOrders})`,
      names.includes('lookup_order') === hasOrders, `→ tools: ${names.join(', ')}`);

    // The bound prompt is what the shopper actually gets answered from.
    const bound = await buildCsSystemPrompt({
      accountId: b.accountId,
      userMessage: 'כמה עולה המשלוח ותוך כמה זמן זה מגיע?',
      digest: { ...digest, boundBrand: b.displayName, policy: cfg?.whatsapp_cs?.policy ?? null } as any,
    });
    check('brand policy is injected into the bound prompt', bound.includes('מדיניות שירות הלקוחות'));
    check('brand voice (persona) is injected', bound.includes('קול המותג'));
    // The header alone is not evidence: formatMetadataForAI() returns a non-empty preamble for ZERO
    // hits, so `includes(header)` passed while the model was handed no knowledge at all. Measure the
    // retrieval itself, and report the count rather than a bare tick.
    // SENTENCES, deliberately — a bare keyword hid this failure three times over. Retrieval returned
    // 0 because vectors were NULL (088); then because plainto_tsquery ANDed every word of the
    // question with no stopword list under 'simple' (089); then, for service questions, because
    // document_chunks was never searched at all (090). Both shapes are asserted: a CONTENT question
    // that captions can answer, and a SERVICE question only the documents can.
    for (const [q, kind] of [
      ['יש לכם משהו לשיער יבש?', 'content'],
      ['כמה עולה המשלוח ותוך כמה זמן זה מגיע?', 'service'],
    ] as [string, string][]) {
      const hits = await searchContentByQuery(b.accountId, q);
      const kinds = Array.from(new Set(hits.map((h: any) => h.type))).join('+');
      check(`RAG answers a ${kind} QUESTION (${hits.length} items: ${kinds || 'none'})`, hits.length > 0,
        hits.length ? '' : '← check migrations 088/089/090');
      if (kind === 'service') {
        check('  …and the service answer comes from the documents, not just captions',
          hits.some((h: any) => h.type === 'document'));
      }
    }

    // A hand-off with nobody on the other end is the failure this whole thread is about. A test
    // account is the one case where that is deliberate — but it is still worth printing, because a
    // demo brand on the shared number means a real shopper CAN reach a hand-off that notifies no one.
    const recips = await resolveRecipients(supabase, b.accountId, cfg.escalation);
    const off = cfg?.escalation?.enabled === false;
    if (cfg?.isTestAccount && off) {
      check('escalation is deliberately OFF (test account) — hand-offs here notify nobody', true,
        '⚠ on the shared number, a real shopper who binds here gets no human');
    } else {
      check(`escalation is on and reaches someone (${recips.length} recipient(s))`,
        !off && recips.length > 0,
        `→ ${recips.map((r: any) => r.email || r.whatsapp).join(', ') || 'NOBODY'}`);
    }
  }

  // The question LA BEAUTÉ's shoppers actually arrive with, against a brand that cannot look orders
  // up. It must reach for a human — never invent a status, never promise a lookup it cannot do.
  const lb = brands.find((b) => b.domain === 'labeauteisrael.co.il');
  if (lb) {
    console.log('\n   LA BEAUTÉ — an order question, with no orders provider');
    const { data: acct } = await supabase.from('accounts').select('config').eq('id', lb.accountId).single();
    const cfg = (acct as any)?.config || {};
    const ts = buildCsToolset({ channel: 'whatsapp', account: { archetype: cfg.archetype, config: cfg }, preBoundAccountId: null });
    const q = 'איפה ההזמנה שלי? מספר הזמנה 10202920';
    const boundSys = await buildCsSystemPrompt({
      accountId: lb.accountId, userMessage: q,
      digest: { ...digest, boundBrand: lb.displayName, policy: cfg?.whatsapp_cs?.policy ?? null, recentTurns: [] } as any,
    });
    const outs: string[] = [];
    const texts: string[] = [];
    for (let i = 0; i < N; i++) {
      const calls: any = await askModel(boundSys, q, ts.defs);
      texts.push(String(calls.text || ''));
      outs.push(calls.length ? calls.map((c: any) => c.name).join('+') : 'text-reply');
    }
    const tally = outs.reduce((m: any, o) => ((m[o] = (m[o] || 0) + 1), m), {});
    console.log(`   ${JSON.stringify(tally)}`);
    texts.forEach((t, i) => console.log(`     [${i}] ${outs[i]} :: ${t.replace(/\n/g, ' ').slice(0, 200)}`));

    check('never calls an order tool it does not have', !outs.some((o) => o.includes('lookup_order')));

    // THE REGRESSION GUARD. Promising a callback without firing escalate_to_human is exactly the
    // failure this whole thread is about — פנינה and דנה were both promised a human and no ticket
    // was ever filed. A reply that says a human will come back MUST carry the tool call.
    const PROMISES_HUMAN = /נציג|נחזור אלי|יחזרו אלי|נעביר אות|מעבירה אות|אעביר/;
    const empty = texts.filter((t, i) => PROMISES_HUMAN.test(t) && !outs[i].includes('escalate'));
    check('never promises a human without actually escalating', empty.length === 0,
      empty.length ? `→ ${empty.length}/${N}: "${empty[0].replace(/\n/g, ' ').slice(0, 150)}"` : '');

    // And it must not answer as though it had looked the order up.
    const INVENTED = /נשלח[הת]?\b|יצא[ה]? אלי|נמסר|כבר בדרך|הסטטוס של ההזמנה|ההזמנה שלך נמצאת/;
    const invented = texts.filter((t) => INVENTED.test(t));
    check('never states an order status it cannot possibly know', invented.length === 0,
      invented.length ? `→ "${invented[0].replace(/\n/g, ' ').slice(0, 150)}"` : '');
  }

  // -- Proof the guard held ---------------------------------------------------
  console.log(`\nGuard: ${allowedReads.length} reads allowed, ${blocked.length} writes/sends BLOCKED`);
  for (const b of Array.from(new Set(blocked))) console.log(`   blocked: ${b}`);
  console.log(failures === 0 ? '\nPASS\n' : `\nFAIL — ${failures} check(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
