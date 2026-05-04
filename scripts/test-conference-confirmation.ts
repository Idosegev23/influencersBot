/**
 * One-off: send a SAMPLE conference-lead confirmation email to a target
 * @ldrsgroup.com address so we can preview the template + verify Gmail
 * delivery is working.
 *
 * Usage:
 *   npx tsx scripts/test-conference-confirmation.ts cto@ldrsgroup.com
 *   npx tsx scripts/test-conference-confirmation.ts            # defaults to cto@ldrsgroup.com
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { buildConferenceLeadConfirmationEmail } from '../src/lib/email-templates/conference-lead-confirmation';
import { sendBriefEmail } from '../src/lib/google-workspace';

async function main() {
  const target = (process.argv[2] || 'cto@ldrsgroup.com').trim();

  if (!/^[\w.+-]+@ldrsgroup\.com$/i.test(target)) {
    console.error(`Refusing to send: target must be an @ldrsgroup.com address. Got: ${target}`);
    process.exit(1);
  }

  const sample = buildConferenceLeadConfirmationEmail({
    fullName: 'איתי דוגמא',
    preferredProduct: 'NewVoices — סוכן קולי AI',
    phone: '050-1234567',
    ownerName: process.env.CONFERENCE_LEAD_OWNER_NAME || 'רועי',
    ownerEmail: process.env.CONFERENCE_LEAD_OWNER_EMAIL || 'roei@ldrsgroup.com',
  });

  console.log(`→ sending confirmation sample to ${target}`);
  console.log(`  subject: ${sample.subject}`);

  const ok = await sendBriefEmail({
    to: target,
    subject: `[דוגמא] ${sample.subject}`,
    htmlBody: sample.html,
  });

  if (ok) {
    console.log(`✓ sent to ${target}`);
    process.exit(0);
  } else {
    console.error(`✗ sendBriefEmail returned false`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('✗ threw:', err);
  process.exit(3);
});
