/**
 * Create the demo_ready_v2 WhatsApp template — demo scan finished, TWO buttons:
 *   button 0: "פתח דמו צ'אט"    → https://bestie.ldrsgroup.com/chat/{{1}}  ({{1}} = username slug)
 *   button 1: "דמו הווידג'ט"    → https://bestie.ldrsgroup.com/demo/{{1}}  ({{1}} = accountId)
 * Body {{1}} = brand name (same as v1).
 *
 * Category MARKETING — Meta auto-classified demo_ready_v1 as MARKETING for the
 * same copy ("אפשר לשלוח ללקוח"), so v2 must match or the submit gets recategorized.
 *
 * Submits as PENDING; sendDemoReady falls back to demo_ready_v1 until approval,
 * so this can run before/after the code deploy in any order.
 *
 * Run: npx tsx scripts/create-wa-template-demo-ready-v2.ts
 * Idempotent: "already exists" from Meta is treated as success-skip.
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

if (!WABA_ID || !TOKEN) {
  console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN');
  process.exit(1);
}

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');

const payload = {
  name: 'demo_ready_v2',
  language: 'he',
  category: 'MARKETING',
  components: [
    {
      type: 'BODY',
      text: 'הדמו של {{1}} מוכן! 🎉 הסריקה הושלמה — צ׳אט ווידג׳ט מחכים לכם.',
      example: { body_text: [['קרולינה למקה']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'פתח דמו צ׳אט',
          url: `${BASE}/chat/{{1}}`,
          example: ['carolina_lemke'],
        },
        {
          type: 'URL',
          text: 'דמו הווידג׳ט',
          url: `${BASE}/demo/{{1}}`,
          example: ['4214549f-813b-406b-8b71-6550268235bb'],
        },
      ],
    },
  ],
};

async function main() {
  const url = `https://graph.facebook.com/${GRAPH}/${WABA_ID}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code;
    const msg = json?.error?.message || res.statusText;
    const detail =
      json?.error?.error_user_msg ||
      json?.error?.error_user_title ||
      json?.error?.error_data?.details ||
      JSON.stringify(json?.error || json).slice(0, 300);
    if (code === 100 && (/already exists/i.test(msg) || /יש תוכן/i.test(detail) || /already has content/i.test(detail))) {
      console.log('· demo_ready_v2: already exists, skipped');
      return;
    }
    console.error(`✗ demo_ready_v2: ${msg}\n    ↳ ${detail}`);
    process.exit(2);
  }
  console.log(`✓ demo_ready_v2: submitted (id=${json.id || '?'} status=${json.status || 'PENDING'})`);
}

main().catch((err) => { console.error('✗ threw:', err); process.exit(3); });
