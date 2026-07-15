/**
 * Create the 2 team-notification WhatsApp templates fired when a scan
 * pipeline completes (see src/lib/pipeline/notify.ts):
 *   - demo_ready_v1     → demo scan finished  ("you can send it to the client")
 *   - account_ready_v1  → real/full scan finished ("the account was set up")
 *
 * Both: body {{1}} = brand name, URL button {{1}} = username slug →
 *   https://bestie.ldrsgroup.com/chat/{{1}}
 *
 * Templates submit as PENDING and are usually approved within a few hours
 * (UTILITY category). After approval, set in Vercel prod env:
 *   WHATSAPP_NOTIFY_ENABLED=true
 *   (per-template flags WHATSAPP_TEMPLATE_DEMO_READY / _ACCOUNT_READY default ON)
 *
 * Run: npx tsx scripts/create-scan-complete-templates.ts
 *
 * Idempotent: if a template name already exists, Meta returns an error and
 * we skip it.
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

interface TemplateSpec {
  name: string;
  description: string;
  // Meta may auto-classify by content: demo_ready ("send it to the client")
  // landed as MARKETING; account_ready as UTILITY. Match what Meta approved so
  // a delete+recreate is idempotent.
  category: 'UTILITY' | 'MARKETING';
  body: string; // {{1}} = brand name
  example_body_text: string[]; // sample value for {{1}}
  // URL button — {{1}} (username slug) is appended to the URL at send time.
  url_button: { display_text: string; url: string; example_suffix: string };
}

const CHAT_BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');
const CHAT_URL = `${CHAT_BASE}/chat/{{1}}`;
const CHAT_EXAMPLE = 'carolina_lemke';

const TEMPLATES: TemplateSpec[] = [
  {
    name: 'demo_ready_v1',
    description: 'Demo scan finished — team notification',
    category: 'MARKETING',
    body: 'הדמו של {{1}} מוכן! 🎉 הסריקה הושלמה ואפשר לשלוח ללקוח.',
    example_body_text: ['קרולינה למקה'],
    url_button: { display_text: 'פתח דמו', url: CHAT_URL, example_suffix: CHAT_EXAMPLE },
  },
  {
    name: 'account_ready_v1',
    description: 'Real/full scan finished — team notification',
    category: 'UTILITY',
    body: 'חשבון {{1}} הוקם והסריקה הושלמה ✅',
    example_body_text: ['ביופפטיקס'],
    url_button: { display_text: 'פתח צ׳אט', url: CHAT_URL, example_suffix: 'biopeptix_official' },
  },
];

async function createOne(spec: TemplateSpec) {
  const payload = {
    name: spec.name,
    language: 'he',
    category: spec.category,
    components: [
      {
        type: 'BODY',
        text: spec.body,
        example: { body_text: [spec.example_body_text] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: spec.url_button.display_text,
            url: spec.url_button.url,
            example: [spec.url_button.example_suffix],
          },
        ],
      },
    ],
  };

  const url = `https://graph.facebook.com/${GRAPH}/${WABA_ID}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
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
    if (
      code === 100 &&
      (/already exists/i.test(msg) ||
        /יש תוכן/i.test(detail) ||
        /already has content/i.test(detail))
    ) {
      console.log(`  · ${spec.name}: already exists, skipped`);
      return { name: spec.name, status: 'exists' as const };
    }
    console.error(`  ✗ ${spec.name}: ${msg}\n      ↳ ${detail}`);
    return { name: spec.name, status: 'error' as const, error: msg };
  }

  console.log(`  ✓ ${spec.name}: submitted (id=${json.id || '?'} status=${json.status || 'PENDING'})`);
  return { name: spec.name, status: 'submitted' as const, response: json };
}

async function main() {
  console.log(`Creating ${TEMPLATES.length} scan-complete templates in WABA ${WABA_ID}...\n`);
  const results = [];
  for (const t of TEMPLATES) {
    console.log(`→ ${t.name} (${t.description})`);
    results.push(await createOne(t));
  }
  console.log('\nDone.');
  const failed = results.filter((r) => r.status === 'error');
  if (failed.length) process.exit(2);
}

main().catch((err) => {
  console.error('✗ threw:', err);
  process.exit(3);
});
