/**
 * End-to-end check of the partner API against a running server.
 *   COPILOT_BASE_URL=http://localhost:3000 COPILOT_KEY=cpk_... COPILOT_HOST=aba.copilot.example.com \
 *   COPILOT_IDENTIFY_SECRET=... npx tsx scripts/copilot-smoke.ts
 *
 * Prints eighteen PASS lines (ten for session/events/identify, one for /contact, seven for /chat including
 * the 413 and a foreign-session refusal), then "All checks passed". Exits non-zero on the first failure.
 * The /chat checks call the live model, so a run takes a few seconds longer and costs a little.
 */
import crypto from 'node:crypto';
import { signIdentify } from '../src/lib/copilot/signature';

const base = process.env.COPILOT_BASE_URL!;
const headers = { 'content-type': 'application/json', authorization: `Bearer ${process.env.COPILOT_KEY}`, 'x-tenant-host': process.env.COPILOT_HOST! };

async function call(path: string, body: unknown) {
  const res = await fetch(`${base}/api/partner/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, text: JSON.stringify(json) };
}
function check(name: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.error(detail); process.exit(1); }
}

const VENDOR = /bestie|influencerbot|ldrs|imai/i;
type StreamEvent = { type: string; [k: string]: any };

/** POST /chat and read the NDJSON body incrementally; lines may be split across chunks. */
async function chat(body: unknown) {
  const started = Date.now();
  const res = await fetch(`${base}/api/partner/v1/chat`, { method: 'POST', headers, body: JSON.stringify(body) });
  const contentType = res.headers.get('content-type') ?? '';
  const events: StreamEvent[] = [];
  const bad: string[] = [];
  let raw = '';
  let firstDeltaMs: number | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    raw += line + '\n';
    try {
      const e = JSON.parse(line);
      events.push(e);
      if (e?.type === 'delta' && firstDeltaMs === null) firstDeltaMs = Date.now() - started;
    } catch { bad.push(line); }
  };
  if (res.status === 200 && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    buf += decoder.decode();
    take(buf);
  } else {
    raw = await res.text().catch(() => '');
  }
  const text = events.filter((e) => e.type === 'delta').map((e) => String(e.text ?? '')).join('');
  return { status: res.status, contentType, events, bad, raw, text, firstDeltaMs, totalMs: Date.now() - started };
}

async function main() {
  const anon1 = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const anon2 = 'smoke_' + crypto.randomBytes(12).toString('hex');

  const s1 = await call('/session', { anonId: anon1 });
  check('session opens', s1.status === 200 && !!s1.json.sessionId, s1);
  check('session body has no vendor names', !/bestie|influencerbot|ldrs|imai/i.test(s1.text), s1.text);

  const s1b = await call('/session', { anonId: anon1, sessionId: s1.json.sessionId });
  check('session resumes', s1b.json.resumed === true && s1b.json.sessionId === s1.json.sessionId, s1b);

  const ev = await call('/events', { visitorId: s1.json.visitorId, events: [{ type: 'page_view', sessionId: s1.json.sessionId, payload: { url: 'https://buses.org/' } }, { type: 'identified' }] });
  check('events accept page_view and reject identified', ev.json.accepted === 1 && ev.json.rejected === 1, ev);

  const wrongHost = await fetch(`${base}/api/partner/v1/session`, { method: 'POST', headers: { ...headers, 'x-tenant-host': 'not-ours.example.org' }, body: JSON.stringify({ anonId: anon1 }) });
  check('unknown host refused', wrongHost.status === 404 || wrongHost.status === 403, wrongHost.status);

  const memberId = 'SMOKE-' + crypto.randomBytes(4).toString('hex');
  const ts = Date.now();
  const sig = signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId, email: null, ts });
  const id1 = await call('/identify', { visitorId: s1.json.visitorId, sessionId: s1.json.sessionId, memberId, ts, signature: sig });
  check('identify device 1', id1.status === 200 && id1.json.merged === false, id1);

  const s2 = await call('/session', { anonId: anon2 });
  const ts2 = Date.now();
  const id2 = await call('/identify', { visitorId: s2.json.visitorId, memberId, ts: ts2, signature: signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId, email: null, ts: ts2 }) });
  check('identify device 2 merges into device 1', id2.status === 200 && id2.json.merged === true && id2.json.visitorId === s1.json.visitorId, id2);

  const forged = await call('/identify', { visitorId: s2.json.visitorId, memberId, ts: Date.now(), signature: 'a'.repeat(64) });
  check('forged signature refused', forged.status === 401, forged);

  // A third device identifies as the same member, then tries to become a different member: must be refused.
  const anon3 = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const s3 = await call('/session', { anonId: anon3 });
  const ts3 = Date.now();
  const id3 = await call('/identify', { visitorId: s3.json.visitorId, memberId, ts: ts3, signature: signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId, email: null, ts: ts3 }) });
  check('identify device 3 as the same member', id3.status === 200, id3);
  const otherMember = 'SMOKE-' + crypto.randomBytes(4).toString('hex');
  const ts4 = Date.now();
  const conflict = await call('/identify', { visitorId: s3.json.visitorId, memberId: otherMember, ts: ts4, signature: signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId: otherMember, email: null, ts: ts4 }) });
  check('identify as a different member is a 409 identity_conflict', conflict.status === 409 && conflict.json.error === 'identity_conflict', conflict);

  // Contact capture: a fresh visitor leaves a test email with consent.
  const contactAnon = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const sc = await call('/session', { anonId: contactAnon });
  const contact = await call('/contact', { visitorId: sc.json.visitorId, email: `smoke+${crypto.randomBytes(6).toString('hex')}@example.com`, consent: true });
  check('contact accepts a consented email', contact.status === 200 && contact.json.ok === true, contact);

  // Chat turn on a fresh visitor, so the identified smoke members above do not change the answer.
  const chatAnon = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const sChat = await call('/session', { anonId: chatAnon });
  const turn = await chat({ visitorId: sChat.json.visitorId, sessionId: sChat.json.sessionId, message: 'What are the benefits of ABA membership?' });
  check('chat answers 200 as application/x-ndjson', turn.status === 200 && /application\/x-ndjson/i.test(turn.contentType) && turn.bad.length === 0, { status: turn.status, contentType: turn.contentType, unparsable: turn.bad, raw: turn.raw.slice(0, 500) });
  const deltas = turn.events.filter((e) => e.type === 'delta');
  check('chat streams at least one delta', deltas.length > 0 && turn.text.length > 0, { events: turn.events.map((e) => e.type), raw: turn.raw.slice(0, 500) });
  check('chat text has no <<META and no vendor names (deltas and whole stream)', !/<<\s*META/i.test(turn.text) && !/<<\s*META/i.test(turn.raw) && !VENDOR.test(turn.text) && !VENDOR.test(turn.raw), turn.text);
  check('chat ends with a done event and no error', turn.events.some((e) => e.type === 'done') && !turn.events.some((e) => e.type === 'error'), turn.events.map((e) => e.type === 'error' ? e : e.type));
  const sourceUrls: string[] = turn.events.filter((e) => e.type === 'sources').flatMap((e) => (Array.isArray(e.items) ? e.items : [])).map((i: any) => String(i?.url ?? ''));
  check('chat source urls all start with http', sourceUrls.every((u) => u.startsWith('http')), sourceUrls);
  console.log(`      time to first delta: ${turn.firstDeltaMs ?? 'n/a'} ms; whole turn: ${turn.totalMs} ms; ${deltas.length} deltas`);
  console.log(`      events: ${turn.events.map((e) => e.type).join(' ')}`);
  console.log(`      answer (first 200 chars): ${turn.text.slice(0, 200).replace(/\s+/g, ' ')}`);
  console.log(`      sources: ${sourceUrls.length ? sourceUrls.join(' | ') : '(none)'}`);

  const tooLong = await chat({ visitorId: sChat.json.visitorId, sessionId: sChat.json.sessionId, message: 'a'.repeat(2001) });
  check('chat message of 2001 characters is refused with 413', tooLong.status === 413, { status: tooLong.status, raw: tooLong.raw.slice(0, 200) });

  // Another visitor's session id must be refused inside the stream, with no answer.
  const otherAnon = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const sOther = await call('/session', { anonId: otherAnon });
  const foreign = await chat({ visitorId: sChat.json.visitorId, sessionId: sOther.json.sessionId, message: 'What are the benefits of ABA membership?' });
  check('chat with another visitor\'s session is an in-stream unknown_session error with no deltas',
    foreign.status === 200 && foreign.events.some((e) => e.type === 'error' && e.error === 'unknown_session') && !foreign.events.some((e) => e.type === 'delta'),
    { status: foreign.status, raw: foreign.raw.slice(0, 300) });

  console.log('\nAll checks passed. Smoke rows use anon ids starting with "smoke_" and member ids starting with "SMOKE-".');
}

main().catch((e) => { console.error(e); process.exit(1); });
