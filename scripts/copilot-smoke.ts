/**
 * End-to-end check of the partner API against a running server.
 *   COPILOT_BASE_URL=http://localhost:3000 COPILOT_KEY=cpk_... COPILOT_HOST=aba.copilot.example.com \
 *   COPILOT_IDENTIFY_SECRET=... npx tsx scripts/copilot-smoke.ts
 *
 * Prints ten PASS lines, then "All checks passed". Exits non-zero on the first failure.
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

  console.log('\nAll checks passed. Smoke rows use anon ids starting with "smoke_" and member ids starting with "SMOKE-".');
}

main().catch((e) => { console.error(e); process.exit(1); });
