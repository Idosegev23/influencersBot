#!/usr/bin/env node
/**
 * Pipeline Measurement Script
 *
 * Sends diverse messages to /api/chat/stream, parses NDJSON responses,
 * then fetches the server-side aggregated metrics from /api/debug/metrics.
 *
 * Usage:
 *   node scripts/measure-pipeline.mjs [baseUrl] [username]
 *
 * Default: http://localhost:3000  miranbuzaglo
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const USERNAME = process.argv[3] || 'miranbuzaglo';

// ============================================
// Message corpus — covers all pipeline paths
// ============================================
const MESSAGES = [
  // --- Greetings (expect greeting_skip) ---
  { text: 'היי', tag: 'greeting' },
  { text: 'שלום', tag: 'greeting' },
  { text: 'אהלן', tag: 'greeting' },
  { text: 'hey', tag: 'greeting' },
  { text: 'hi', tag: 'greeting' },
  { text: 'מה קורה', tag: 'greeting' },
  { text: 'בוקר טוב', tag: 'greeting' },
  { text: 'yo', tag: 'greeting' },

  // --- Coupon queries (expect rag or fts, coupon intent) ---
  { text: 'יש לך קופונים?', tag: 'coupon' },
  { text: 'יש קוד הנחה?', tag: 'coupon' },
  { text: 'איזה קופונים יש?', tag: 'coupon' },
  { text: 'יש הנחה על משלוח?', tag: 'coupon' },
  { text: 'קוד הנחה לספרינג', tag: 'coupon' },
  { text: 'תני לי קופון', tag: 'coupon' },
  { text: 'מה הקופון של רנואר?', tag: 'coupon' },
  { text: 'יש הנחה היום?', tag: 'coupon' },

  // --- Support queries (expect support_flow) ---
  { text: 'יש לי בעיה בהזמנה', tag: 'support' },
  { text: 'הקופון לא עובד', tag: 'support' },
  { text: 'לא הגיעה הזמנה שלי', tag: 'support' },
  { text: 'איפה ההזמנה שלי', tag: 'support' },
  { text: 'יש בעיה עם הקופון', tag: 'support' },
  { text: 'המוצר שהזמנתי פגום', tag: 'support' },

  // --- Knowledge queries (expect rag with/without expand) ---
  { text: 'ספרי לי על שגרת הטיפוח שלך', tag: 'knowledge' },
  { text: 'מה את ממליצה לעור יבש?', tag: 'knowledge' },
  { text: 'איזה סרום את משתמשת?', tag: 'knowledge' },
  { text: 'מה את חושבת על רטינול?', tag: 'knowledge' },
  { text: 'איזה מותגי טיפוח את אוהבת?', tag: 'knowledge' },
  { text: 'ספרי על המותגים שלך', tag: 'knowledge' },
  { text: 'איך שומרים על עור הפנים?', tag: 'knowledge' },
  { text: 'מה את ממליצה לכתמים?', tag: 'knowledge' },
  { text: 'יש לך טיפ לעור שמן?', tag: 'knowledge' },
  { text: 'מה השגרה שלך בבוקר?', tag: 'knowledge' },

  // --- Sales intent ---
  { text: 'כמה עולה המוצר?', tag: 'sales' },
  { text: 'אני רוצה לקנות', tag: 'sales' },
  { text: 'כמה עולה הקרם?', tag: 'sales' },

  // --- Human handoff ---
  { text: 'תעבירי לנציג אמיתי', tag: 'handoff' },
  { text: 'אני רוצה לדבר עם אדם', tag: 'handoff' },

  // --- General / ambiguous ---
  { text: 'מה דעתך?', tag: 'general' },
  { text: 'תודה רבה!', tag: 'general' },
  { text: 'מעניין', tag: 'general' },
  { text: 'תמשיכי', tag: 'general' },
  { text: 'ואו, לא ידעתי', tag: 'general' },

  // --- Short follow-ups ---
  { text: 'עוד קופון', tag: 'followup' },
  { text: 'עוד טיפ', tag: 'followup' },
  { text: 'ומה לגבי שיער?', tag: 'followup' },
  { text: 'ומה עם ציפורניים?', tag: 'followup' },

  // --- Hebrew normalization stress ---
  { text: 'יש מתכונים טובים?', tag: 'hebrew' },
  { text: 'חולצות חורף', tag: 'hebrew' },
  { text: 'המלצות לאימונים', tag: 'hebrew' },
];

// ============================================
// NDJSON stream parser
// ============================================
async function sendMessage(text, sessionId) {
  const clientStart = Date.now();
  let ttftClient = 0;
  let fullText = '';
  let latencyMs = 0;
  let error = null;
  let firstTokenReceived = false;

  try {
    const res = await fetch(`${BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        username: USERNAME,
        sessionId: sessionId || undefined,
      }),
    });

    if (!res.ok) {
      return { error: `HTTP ${res.status}`, clientMs: Date.now() - clientStart, ttftClient: 0, fullText: '', sessionId };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let newSessionId = sessionId;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (event.type === 'meta') {
            newSessionId = event.sessionId;
          }

          if (event.type === 'delta') {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              ttftClient = Date.now() - clientStart;
            }
            fullText += event.text;
          }

          if (event.type === 'done') {
            latencyMs = event.latencyMs;
          }

          if (event.type === 'error') {
            error = event.message;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return {
      clientMs: Date.now() - clientStart,
      serverMs: latencyMs,
      ttftClient,
      responseLen: fullText.length,
      fullText: fullText.substring(0, 80),
      error,
      sessionId: newSessionId,
    };
  } catch (e) {
    return { error: e.message, clientMs: Date.now() - clientStart, ttftClient: 0, fullText: '', sessionId };
  }
}

// ============================================
// Main runner
// ============================================
async function main() {
  console.log(`\n🔬 Pipeline Measurement — ${MESSAGES.length} messages to ${BASE} (user: ${USERNAME})\n`);

  // Reset server-side aggregator
  try {
    await fetch(`${BASE}/api/debug/metrics`, { method: 'DELETE' });
    console.log('✅ Server aggregator reset\n');
  } catch {
    console.log('⚠️  Could not reset aggregator (endpoint may not exist yet)\n');
  }

  const results = [];
  let sessionId = null;

  // Send messages sequentially (to maintain session context for follow-ups)
  for (let i = 0; i < MESSAGES.length; i++) {
    const msg = MESSAGES[i];
    const progress = `[${String(i + 1).padStart(2)}/${MESSAGES.length}]`;

    // Use fresh session every 10 messages to test session creation too
    if (i % 10 === 0) sessionId = null;

    const result = await sendMessage(msg.text, sessionId);
    sessionId = result.sessionId || sessionId;

    const status = result.error ? '❌' : '✅';
    const ttft = result.ttftClient ? `ttft=${result.ttftClient}ms` : 'no-ttft';
    console.log(`${progress} ${status} [${msg.tag.padEnd(10)}] "${msg.text}" → ${result.clientMs}ms (${ttft}) ${result.error || ''}`);

    results.push({ ...msg, ...result });

    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // ============================================
  // Fetch server-side aggregated metrics
  // ============================================
  console.log('\n📊 Fetching server-side metrics...\n');

  let serverMetrics;
  try {
    const metricsRes = await fetch(`${BASE}/api/debug/metrics?raw=1`);
    serverMetrics = await metricsRes.json();
  } catch (e) {
    console.error('Failed to fetch metrics:', e.message);
    serverMetrics = null;
  }

  // ============================================
  // Client-side analysis
  // ============================================
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  console.log('═'.repeat(80));
  console.log('  PIPELINE MEASUREMENT REPORT');
  console.log('═'.repeat(80));
  console.log(`\nTotal messages: ${results.length} (${successful.length} ok, ${failed.length} errors)\n`);

  if (failed.length > 0) {
    console.log('--- Errors ---');
    for (const f of failed) {
      console.log(`  "${f.text}" → ${f.error}`);
    }
    console.log('');
  }

  // Client-side timing
  const clientMs = successful.map(r => r.clientMs).sort((a, b) => a - b);
  const clientTtft = successful.filter(r => r.ttftClient > 0).map(r => r.ttftClient).sort((a, b) => a - b);

  const pct = (arr, p) => arr.length > 0 ? arr[Math.min(Math.floor(arr.length * p), arr.length - 1)] : 0;

  console.log('1) LATENCY (client-side, includes network)');
  console.log('─'.repeat(60));
  console.log(`  totalMs   p50=${pct(clientMs, 0.5)}ms  p95=${pct(clientMs, 0.95)}ms  min=${clientMs[0]}ms  max=${clientMs[clientMs.length - 1]}ms`);
  console.log(`  ttft      p50=${pct(clientTtft, 0.5)}ms  p95=${pct(clientTtft, 0.95)}ms  (n=${clientTtft.length})`);

  // Server-side timing from aggregator
  if (serverMetrics?.summary) {
    const s = serverMetrics.summary;
    console.log('\n  (server-side from aggregator)');
    if (s.latency) {
      console.log(`  totalMs   p50=${s.latency.total?.p50}ms  p95=${s.latency.total?.p95}ms`);
      console.log(`  ttft      p50=${s.latency.ttft?.p50}ms  p95=${s.latency.ttft?.p95}ms`);
      console.log(`  kr        p50=${s.latency.knowledgeRetrieval?.p50}ms  p95=${s.latency.knowledgeRetrieval?.p95}ms`);
    }
  }

  // ============================================
  // Server-side detailed metrics from raw data
  // ============================================
  if (serverMetrics?.raw && serverMetrics.raw.length > 0) {
    const raw = serverMetrics.raw;
    console.log(`\n\n2) SERVER-SIDE DETAILED METRICS (n=${raw.length})`);
    console.log('─'.repeat(60));

    // Timing distributions
    const fields = ['totalMs', 'ttftMs', 'openaiStreamMs', 'embeddingMs', 'matchDocChunksMs', 'expandQueryMs', 'keywordSupplementMs', 'heuristicRerankMs'];
    for (const f of fields) {
      const vals = raw.map(r => r[f]).filter(v => v > 0).sort((a, b) => a - b);
      if (vals.length > 0) {
        console.log(`  ${f.padEnd(25)} n=${String(vals.length).padStart(3)}  p50=${String(pct(vals, 0.5)).padStart(5)}ms  p95=${String(pct(vals, 0.95)).padStart(5)}ms  max=${String(vals[vals.length - 1]).padStart(5)}ms`);
      }
    }

    // Percentages
    console.log('\n3) GATE PERCENTAGES');
    console.log('─'.repeat(60));
    const total = raw.length;
    const expandCalled = raw.filter(r => r.expandQueryCalled).length;
    const expandSkipped = raw.filter(r => r.expandQuerySkippedConfident).length;
    const kwCalled = raw.filter(r => r.keywordSupplementCalled).length;
    const kwSkipped = raw.filter(r => r.keywordSupplementSkipped).length;
    const nanoAttempted = raw.filter(r => r.nanoAttempted).length;
    const nanoSucceeded = raw.filter(r => r.nanoSucceeded).length;
    const nanoTimedOut = raw.filter(r => r.nanoTimedOut).length;
    const regexFallback = raw.filter(r => r.regexFallback).length;
    const sugFallback = raw.filter(r => r.suggestionFallbackTriggered).length;

    const pctStr = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'N/A';

    console.log(`  expandQueryCalled:           ${expandCalled}/${total} = ${pctStr(expandCalled, total)}`);
    console.log(`  expandQuerySkippedConfident:  ${expandSkipped}/${total} = ${pctStr(expandSkipped, total)}`);
    const expandTotal = expandCalled + expandSkipped;
    console.log(`  expandQuery reduction:        ${expandSkipped}/${expandTotal} = ${pctStr(expandSkipped, expandTotal)} (of applicable requests)`);
    console.log(`  keywordSupplementCalled:      ${kwCalled}/${total} = ${pctStr(kwCalled, total)}`);
    console.log(`  keywordSupplementSkipped:     ${kwSkipped}/${total} = ${pctStr(kwSkipped, total)}`);
    console.log(`  nanoAttempted:                ${nanoAttempted}/${total} = ${pctStr(nanoAttempted, total)}`);
    console.log(`  nanoSucceeded:                ${nanoSucceeded}/${nanoAttempted} = ${pctStr(nanoSucceeded, nanoAttempted)}`);
    console.log(`  nanoTimedOut:                 ${nanoTimedOut}/${nanoAttempted} = ${pctStr(nanoTimedOut, nanoAttempted)}`);
    console.log(`  regexFallback:                ${regexFallback}/${total} = ${pctStr(regexFallback, total)}`);
    console.log(`  suggestionFallbackTriggered:  ${sugFallback}/${total} = ${pctStr(sugFallback, total)}`);

    // Threshold distribution
    const thresholds = {};
    for (const r of raw) {
      thresholds[r.thresholdUsed] = (thresholds[r.thresholdUsed] || 0) + 1;
    }
    console.log(`\n  Threshold distribution:`);
    for (const [k, v] of Object.entries(thresholds)) {
      console.log(`    ${k}: ${v}/${total} = ${pctStr(v, total)}`);
    }

    // Retrieval path distribution
    const paths = {};
    for (const r of raw) {
      paths[r.retrievalPath] = (paths[r.retrievalPath] || 0) + 1;
    }
    console.log(`\n  Retrieval path distribution:`);
    for (const [k, v] of Object.entries(paths)) {
      console.log(`    ${k}: ${v}/${total} = ${pctStr(v, total)}`);
    }

    // Histogram: topSimilarity
    console.log('\n4) HISTOGRAMS');
    console.log('─'.repeat(60));
    const sims = raw.map(r => r.topSimilarity);
    const simBuckets = { '<0.3': 0, '0.3-0.6': 0, '>0.6': 0 };
    for (const s of sims) {
      if (s < 0.3) simBuckets['<0.3']++;
      else if (s <= 0.6) simBuckets['0.3-0.6']++;
      else simBuckets['>0.6']++;
    }
    console.log(`  topSimilarity:`);
    for (const [k, v] of Object.entries(simBuckets)) {
      const bar = '█'.repeat(Math.round((v / total) * 30));
      console.log(`    ${k.padEnd(8)} ${String(v).padStart(3)} ${bar} ${pctStr(v, total)}`);
    }

    // Histogram: chunksReturned
    const chunks = raw.map(r => r.chunksReturned);
    const chunkBuckets = { '0': 0, '1-2': 0, '3-5': 0, '6+': 0 };
    for (const c of chunks) {
      if (c === 0) chunkBuckets['0']++;
      else if (c <= 2) chunkBuckets['1-2']++;
      else if (c <= 5) chunkBuckets['3-5']++;
      else chunkBuckets['6+']++;
    }
    console.log(`  chunksReturned:`);
    for (const [k, v] of Object.entries(chunkBuckets)) {
      const bar = '█'.repeat(Math.round((v / total) * 30));
      console.log(`    ${k.padEnd(8)} ${String(v).padStart(3)} ${bar} ${pctStr(v, total)}`);
    }

    // ============================================
    // 20 sampled request metric lines
    // ============================================
    console.log('\n5) SAMPLED REQUEST METRICS (20 diverse lines)');
    console.log('─'.repeat(120));

    // Pick diverse samples: some from each path
    const byPath = {};
    for (let i = 0; i < raw.length; i++) {
      const path = raw[i].retrievalPath;
      (byPath[path] = byPath[path] || []).push({ idx: i, ...raw[i] });
    }

    const samples = [];
    // Take up to 5 from each path
    for (const [path, items] of Object.entries(byPath)) {
      const take = Math.min(5, items.length);
      for (let i = 0; i < take; i++) {
        samples.push(items[i]);
      }
    }
    // Fill remainder from any path
    let ri = 0;
    while (samples.length < 20 && ri < raw.length) {
      if (!samples.find(s => s.idx === ri)) {
        samples.push({ idx: ri, ...raw[ri] });
      }
      ri++;
    }

    console.log(`${'#'.padStart(3)} ${'path'.padEnd(15)} ${'total'.padStart(6)} ${'ttft'.padStart(6)} ${'stream'.padStart(6)} ${'embed'.padStart(6)} ${'rpc'.padStart(6)} ${'expand'.padStart(7)} ${'kw'.padStart(6)} ${'rerank'.padStart(6)} ${'chunks'.padStart(6)} ${'topSim'.padStart(6)} ${'threshold'.padEnd(18)} nano     message`);
    for (const s of samples.slice(0, 20)) {
      const nanoLabel = s.nanoSucceeded ? 'ok' : s.nanoTimedOut ? 'timeout' : s.regexFallback ? 'regex' : '-';
      const msgText = (results[s.idx]?.text || '?').substring(0, 20);
      console.log(
        `${String(s.idx + 1).padStart(3)} ` +
        `${s.retrievalPath.padEnd(15)} ` +
        `${String(s.totalMs).padStart(6)} ` +
        `${String(s.ttftMs).padStart(6)} ` +
        `${String(s.openaiStreamMs || 0).padStart(6)} ` +
        `${String(s.embeddingMs || 0).padStart(6)} ` +
        `${String(s.matchDocChunksMs || 0).padStart(6)} ` +
        `${String(s.expandQueryMs || 0).padStart(7)} ` +
        `${String(s.keywordSupplementMs || 0).padStart(6)} ` +
        `${String(s.heuristicRerankMs || 0).padStart(6)} ` +
        `${String(s.chunksReturned).padStart(6)} ` +
        `${s.topSimilarity.toFixed(3).padStart(6)} ` +
        `${s.thresholdUsed.padEnd(18)} ` +
        `${nanoLabel.padEnd(8)} ` +
        `${msgText}`
      );
    }
  } else {
    console.log('\n⚠️  No raw server metrics available. Make sure /api/debug/metrics endpoint works.');
  }

  // ============================================
  // Conclusion
  // ============================================
  console.log('\n' + '═'.repeat(80));
  console.log('  CONCLUSION');
  console.log('═'.repeat(80));

  const errorRate = failed.length / results.length;
  const avgMs = clientMs.length > 0 ? Math.round(clientMs.reduce((s, v) => s + v, 0) / clientMs.length) : 0;

  console.log(`  Error rate:    ${(errorRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency:   ${avgMs}ms (client-side)`);
  console.log(`  p95 latency:   ${pct(clientMs, 0.95)}ms`);
  console.log(`  Median TTFT:   ${pct(clientTtft, 0.5)}ms`);

  if (errorRate < 0.05 && pct(clientMs, 0.95) < 15000) {
    console.log('\n  ✅ PRODUCTION READY — error rate < 5%, p95 < 15s');
  } else if (errorRate < 0.1) {
    console.log('\n  ⚠️  CONDITIONALLY READY — review errors and latency outliers');
  } else {
    console.log('\n  ❌ NOT READY — error rate too high or latency unacceptable');
  }

  console.log('\n');
}

main().catch(console.error);
