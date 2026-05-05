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
}

// Hebrew templates. The {{n}} placeholders are positional and must be
// supplied in the same order at send time. Keep body under ~1024 chars
// or Meta will reject; ours are well within.
const TEMPLATES: TemplateSpec[] = [
  {
    name: 'support_status_in_progress',
    description: 'Brand started handling the ticket',
    body:
      'היי {{1}} 👋\n' +
      'הפנייה שלך ל-{{2}} (#{{3}}) התקבלה ואנחנו מטפלים בה כעת ✨\n' +
      'נחזור אליך בהקדם עם עדכון. תודה על הסבלנות 🤍',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123'],
  },
  {
    name: 'support_status_awaiting_customer',
    description: 'Brand needs more info from customer',
    body:
      'היי {{1}} 👋\n' +
      'בנוגע לפנייה שלך ל-{{2}} (#{{3}}) — אנחנו צריכים ממך פרט נוסף כדי להמשיך:\n' +
      '{{4}}\n\n' +
      'אפשר להשיב כאן או דרך טופס הפנייה שמילאת. תודה 🤍',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123', 'תמונה של המוצר הפגום'],
  },
  {
    name: 'support_status_shipped',
    description: 'Replacement / refund shipped',
    body:
      'היי {{1}} 👋\n' +
      'בנוגע לפנייה שלך ל-{{2}} (#{{3}}) — שלחנו לך בדואר {{4}}.\n' +
      'מספר משלוח Focus למעקב: {{5}}\n' +
      'מקווים שהכל יסתדר 🤍',
    example_body_text: ['מיכל', 'LA BEAUTÉ', 'A123', 'מוצר חלופי', '3409393'],
  },
  {
    name: 'support_status_resolved',
    description: 'Issue resolved',
    body:
      'היי {{1}} 👋\n' +
      'הפנייה שלך ל-{{2}} (#{{3}}) טופלה ✅\n' +
      '{{4}}\n\n' +
      'אם יש משהו נוסף, אנחנו כאן 🤍',
    example_body_text: [
      'מיכל',
      'LA BEAUTÉ',
      'A123',
      'שלחנו לך מוצר חלופי במקום זה שהגיע פגום.',
    ],
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
