/**
 * Create 4 WhatsApp message templates in Meta for support-ticket
 * status transitions. Templates submit as PENDING and are usually
 * approved within a few hours (UTILITY category).
 *
 * After approval, set:
 *   WHATSAPP_NOTIFY_ENABLED=true
 *   WHATSAPP_TEMPLATE_SUPPORT_STATUS_IN_PROGRESS=true   (and others)
 *
 * Run: npx tsx scripts/create-support-status-templates.ts
 *
 * The script is idempotent: if a template with the same name exists,
 * Meta returns an error and we move on to the next.
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
  body: string; // {{1}}, {{2}}, ... placeholders
  example_body_text: string[]; // sample values for each {{n}}
  // URL button — {{1}} is appended to the URL at send time.
  // Example URL = https://bestie.ldrsgroup.com/reply/{{1}}
  // Example value = a real reply token to satisfy Meta's example check.
  url_button: { display_text: string; url: string; example_suffix: string };
}

const REPLY_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com';
const REPLY_URL = `${REPLY_BASE.replace(/\/$/, '')}/reply/{{1}}`;
const REPLY_EXAMPLE = `${REPLY_BASE.replace(/\/$/, '')}/reply/abc123XYZ_-token`;
const REPLY_BUTTON = {
  display_text: 'להגיב לפנייה',
  url: REPLY_URL,
  example_suffix: 'abc123XYZ_-token',
};

// Hebrew templates v2 — all with a URL button to /reply/<token> so the
// customer can reply through the brand-side dashboard instead of via
// WhatsApp text reply (we don't have a UI for inbound free-text yet).
const TEMPLATES: TemplateSpec[] = [
  {
    name: 'support_status_in_progress_v2',
    description: 'Brand started handling the ticket',
    body:
      'היי {{1}} 👋\n' +
      'הפנייה שלך ל-{{2}} (#{{3}}) התקבלה ואנחנו מטפלים בה כעת ✨\n' +
      'נחזור אליך בהקדם עם עדכון. אם רוצה להוסיף פרטים — אפשר ללחוץ על הכפתור למטה.',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123'],
    url_button: REPLY_BUTTON,
  },
  {
    name: 'support_status_awaiting_customer_v2',
    description: 'Brand needs more info from customer',
    body:
      'היי {{1}} 👋\n' +
      'בנוגע לפנייה שלך ל-{{2}} (#{{3}}) — אנחנו צריכים ממך פרט נוסף כדי להמשיך:\n' +
      '{{4}}\n\n' +
      'לחיצה על הכפתור למטה תפתח עמוד מאובטח שבו אפשר לשלוח את המידע. תודה 🤍',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123', 'תמונה של המוצר הפגום'],
    url_button: REPLY_BUTTON,
  },
  {
    name: 'support_status_shipped_v2',
    description: 'Replacement / refund shipped',
    body:
      'היי {{1}} 👋\n' +
      'בנוגע לפנייה שלך ל-{{2}} (#{{3}}) — שלחנו לך בדואר {{4}}.\n' +
      'מספר משלוח Focus למעקב: {{5}}\n' +
      'מקווים שהכל יסתדר. אם יש שאלה — הכפתור למטה פותח את עמוד הפנייה שלך.',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123', 'מוצר חלופי', '3409393'],
    url_button: REPLY_BUTTON,
  },
  {
    name: 'support_status_resolved_v2',
    description: 'Issue resolved',
    body:
      'היי {{1}} 👋\n' +
      'הפנייה שלך ל-{{2}} (#{{3}}) טופלה ✅\n' +
      '{{4}}\n\n' +
      'אם יש משהו נוסף, הכפתור למטה ייפתח את עמוד הפנייה ותוכלי להגיב שם.',
    example_body_text: [
      'מיכל',
      'LA BEAUTÉ',
      'A123',
      'שלחנו לך מוצר חלופי במקום זה שהגיע פגום.',
    ],
    url_button: REPLY_BUTTON,
  },
];

async function createOne(spec: TemplateSpec) {
  const payload = {
    name: spec.name,
    language: 'he',
    category: 'UTILITY',
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
    if (code === 100 && /already exists/i.test(msg)) {
      console.log(`  · ${spec.name}: already exists, skipped`);
      return { name: spec.name, status: 'exists' as const };
    }
    console.error(`  ✗ ${spec.name}: ${msg}`);
    return { name: spec.name, status: 'error' as const, error: msg };
  }

  console.log(`  ✓ ${spec.name}: submitted (id=${json.id || '?'} status=${json.status || 'PENDING'})`);
  return { name: spec.name, status: 'submitted' as const, response: json };
}

async function main() {
  console.log(`Creating ${TEMPLATES.length} support-status templates in WABA ${WABA_ID}...\n`);
  for (const t of TEMPLATES) {
    console.log(`→ ${t.name} (${t.description})`);
    await createOne(t);
  }
  console.log('\nDone. Templates submitted as PENDING — Meta typically approves UTILITY templates within a few hours.');
  console.log('Once approved, flip the env flags to enable each one.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
