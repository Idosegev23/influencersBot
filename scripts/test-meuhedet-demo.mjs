#!/usr/bin/env node
/**
 * One-off: ask the Meuhedet demo account the 3 demo questions against prod
 * and print full answers for quality review.
 * Run: node scripts/test-meuhedet-demo.mjs
 */
const API_URL = 'https://influencers-bot.vercel.app';
const USERNAME = 'meuhedet';

const QUESTIONS = [
  'אני הורה לילד בן 8 — אילו שירותים של מאוחדת יכולים להיות רלוונטיים עבורו?',
  'ראיתי תוכן של מאוחדת על אורח חיים בריא — מה ההמלצות המרכזיות ואיפה אני יכול לראות את התוכן המלא?',
  'ראיתי סרטון של מאוחדת על בריאות הילדים, ואני רוצה לדעת מי עוד ממאוחדת דיבר על הנושא הזה ומה הם אמרו.',
];

async function ask(message, sessionId) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, message, ...(sessionId ? { sessionId } : {}) }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
  try { return JSON.parse(text); } catch { return { error: `bad json: ${text.slice(0, 500)}` }; }
}

for (const [i, q] of QUESTIONS.entries()) {
  console.log(`\n${'='.repeat(80)}\n❓ שאלה ${i + 1}: ${q}\n${'-'.repeat(80)}`);
  const t0 = Date.now();
  const data = await ask(q); // fresh session per question — like a new visitor
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (data.error) {
    console.log(`❌ ${data.error}`);
  } else {
    console.log(`✅ (${dt}s)\n${data.response || data.message || JSON.stringify(data).slice(0, 1000)}`);
  }
}
