/**
 * Create the `bestie_handoff_lead` WhatsApp message template via Meta's
 * Cloud API. Run once — subsequent runs will return Meta's "name already
 * exists" error which is fine.
 *
 * Reads creds from .env.local:
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_BUSINESS_ACCOUNT_ID
 *
 * Usage:
 *   npx tsx scripts/create-whatsapp-template.ts
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const TEMPLATE_NAME = 'bestie_handoff_lead';
const LANGUAGE = 'he';

const body = {
  name: TEMPLATE_NAME,
  language: LANGUAGE,
  category: 'UTILITY',
  components: [
    {
      type: 'BODY',
      text:
        '[#{{1}}] ליד חדש מ-Bestie\n\n' +
        '👤 {{2}}\n' +
        '💬 {{3}}\n\n' +
        '📌 ענה כאן בוואטסאפ — התשובה תופיע ישירות אצלו ב-Bestie.',
      example: {
        body_text: [
          [
            'A4F2',
            'Noa Lavi · @noki_coffe · 9,138 עוקבים',
            'היי, אני יוצרת תוכן ובעלת בית קפה. מעוניינת לשמוע על שירותי IMAI',
          ],
        ],
      },
    },
    {
      type: 'FOOTER',
      text: 'LDRS · Bestie Handoff',
    },
  ],
};

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !wabaId) {
    console.error('✗ Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in .env.local');
    process.exit(1);
  }

  const url = `https://graph.facebook.com/v22.0/${wabaId}/message_templates`;
  console.log(`→ POST ${url}`);
  console.log(`  template: ${TEMPLATE_NAME} (${LANGUAGE}, UTILITY)`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(2);
  }

  console.log(`✓ Created`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('✗ threw:', err);
  process.exit(3);
});
