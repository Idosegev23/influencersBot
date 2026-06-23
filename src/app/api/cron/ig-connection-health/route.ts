/**
 * Cron: Instagram connection health + self-heal (daily).
 *
 * Refreshes expiring tokens, verifies token + `messages` webhook subscription
 * for every active connection with the DM bot ON (re-subscribing automatically
 * when it can), and emails admins about anything it could not fix — including
 * inbound DMs that matched no account in the last 24h. This is what stops a
 * connection from silently dying (expired token / dropped subscription) and
 * going unnoticed for weeks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runIgConnectionHealth } from '@/lib/instagram-graph/connection-health';
import { sendAdminAlert } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_EMAILS = ['triroars@gmail.com', 'cto@ldrsgroup.com', 'yoav@ldrsgroup.com'];

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report = await runIgConnectionHealth();

  const hasProblems = report.problems.length > 0 || report.unresolvedWebhooks24h > 0;
  if (hasProblems) {
    const lines: string[] = [];
    if (report.problems.length) {
      lines.push('בעיות חיבור Instagram:');
      lines.push(...report.problems.map((p) => `• ${p}`));
    }
    if (report.unresolvedWebhooks24h > 0) {
      lines.push(
        `• ${report.unresolvedWebhooks24h} הודעות DM שהגיעו ולא הצליחו להתמפות לחשבון ב-24 השעות האחרונות`,
      );
    }
    if (report.resubscribed.length) {
      lines.push('', `תוקן אוטומטית (נרשם מחדש ל-webhook): ${report.resubscribed.join(', ')}`);
    }

    const critical = report.problems.some((p) => /EXPIRED|invalid|MISSING/.test(p));
    await sendAdminAlert({
      level: critical ? 'critical' : 'warning',
      subject: `בריאות חיבורי Instagram — ${report.problems.length} בעיות לטיפול`,
      message: lines.join('\n'),
      adminEmails: ADMIN_EMAILS,
    });
  }

  return NextResponse.json({ checked: new Date().toISOString(), ...report });
}
