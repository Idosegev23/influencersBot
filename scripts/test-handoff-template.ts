/**
 * Manually fire bestie_handoff_lead at the configured ITAMAR_WHATSAPP_NUMBER
 * (or argv[2]) to verify Cloud API delivery is working before we run the
 * full UI bridge.
 *
 * Usage:
 *   npx tsx scripts/test-handoff-template.ts            # uses env
 *   npx tsx scripts/test-handoff-template.ts +9725...   # explicit override
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { sendTemplate } from '../src/lib/whatsapp-cloud/client';

async function main() {
  const to = (process.argv[2] || process.env.ITAMAR_WHATSAPP_NUMBER || '').trim();
  if (!to) {
    console.error('✗ no recipient (set ITAMAR_WHATSAPP_NUMBER or pass argv[2])');
    process.exit(1);
  }

  console.log(`→ sending bestie_handoff_lead to ${to}`);
  const res = await sendTemplate({
    to,
    templateName: 'bestie_handoff_lead',
    languageCode: 'he',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'A4F2' },
          { type: 'text', text: 'Noa Lavi · @noki_coffe · 9,138 עוקבים' },
          {
            type: 'text',
            text:
              'היי, אני יוצרת תוכן ובעלת בית קפה. ' +
              'מעוניינת לשמוע על שירותי IMAI ושיתופי פעולה.',
          },
        ],
      },
    ],
  });

  if (res.success) {
    console.log(`✓ sent | wa_message_id=${res.wa_message_id}`);
  } else {
    console.error(`✗ send failed:`, JSON.stringify(res.error, null, 2));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
