/**
 * Create the `support_freeform_message` WhatsApp template — a freeform
 * outbound for support agents: a fixed wrapper with brand context plus
 * one large free-text variable the agent fills in at send time.
 *
 * Why this template exists: the existing support_status_* templates all
 * carry a URL button to /reply/<token>, which trains customers to reply
 * via web (so the WhatsApp 24h customer service window never opens).
 * This template has NO URL button — the body invites the customer to
 * reply directly in WhatsApp, opening the service window so the agent
 * can follow up with arbitrary free-form text via send-text.
 *
 * Run: npx tsx scripts/create-support-freeform-template.ts
 *
 * Idempotent: re-running after the first submission returns Meta's
 * "name already exists" error which we treat as a no-op.
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

const TEMPLATE_NAME = 'support_freeform_message';
const LANGUAGE = 'he';

// {{1}} = customer first name | {{2}} = brand (used twice) |
// {{3}} = free-form message body (up to ~900 chars).
// Total body after substitution stays under Meta's 1024 cap because
// the wrapper is ~80 chars and {{1}}/{{2}} are short.
const payload = {
  name: TEMPLATE_NAME,
  language: LANGUAGE,
  category: 'UTILITY',
  components: [
    {
      type: 'BODY',
      text:
        'היי {{1}} 👋\n' +
        'עדכון בנוגע לפנייה שלך ל-{{2}}:\n\n' +
        '{{3}}\n\n' +
        '– צוות {{2}} 🤍',
      example: {
        body_text: [
          [
            'מיכל',
            'LA BEAUTÉ',
            'בדקנו את ההזמנה שלך ומצאנו שהמשלוח אכן יצא בלי הסרום. אנחנו שולחים אלייך אותו עכשיו במשלוח חוזר ללא עלות, צפי הגעה תוך 3 ימי עסקים. מתנצלים על אי הנוחות.',
          ],
        ],
      },
    },
    {
      type: 'FOOTER',
      text: 'אפשר להשיב להודעה הזו כאן בוואטסאפ',
    },
  ],
};

async function main() {
  const url = `https://graph.facebook.com/${GRAPH}/${WABA_ID}/message_templates`;
  console.log(`→ POST ${url}`);
  console.log(`  template: ${TEMPLATE_NAME} (${LANGUAGE}, UTILITY)`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code;
    const msg = data?.error?.message || res.statusText;
    const detail =
      data?.error?.error_user_msg ||
      data?.error?.error_user_title ||
      data?.error?.error_data?.details ||
      JSON.stringify(data?.error || data).slice(0, 500);
    if (
      code === 100 &&
      (/already exists/i.test(msg) ||
        /יש תוכן/i.test(detail) ||
        /already has content/i.test(detail))
    ) {
      console.log(`· ${TEMPLATE_NAME}: already exists, skipped`);
      return;
    }
    console.error(`✗ HTTP ${res.status}`);
    console.error(`  ${msg}`);
    console.error(`  detail: ${detail}`);
    process.exit(2);
  }

  console.log(`✓ submitted`);
  console.log(`  id=${data.id || '?'}  status=${data.status || 'PENDING'}`);
  console.log(
    '\nMeta typically approves UTILITY templates within minutes to a few hours.',
  );
  console.log(
    'Check status at: https://business.facebook.com/wa/manage/message-templates/',
  );
}

main().catch((err) => {
  console.error('✗ threw:', err);
  process.exit(3);
});
