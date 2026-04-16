import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisHealthCheck, isRedisAvailable, redisGet, redisSet } from '@/lib/redis';
import { sendAdminAlert } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ADMIN_EMAILS = [
  'triroars@gmail.com',
  'cto@ldrsgroup.com',
  'yoav@ldrsgroup.com',
];

// Cooldown: don't send same alert type more than once per hour
const ALERT_COOLDOWN_SECONDS = 3600;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

async function shouldSendAlert(alertKey: string): Promise<boolean> {
  if (!isRedisAvailable()) return true; // no Redis = always send (better safe)
  const lastSent = await redisGet<number>(`alert:cooldown:${alertKey}`);
  return !lastSent;
}

async function markAlertSent(alertKey: string): Promise<void> {
  if (isRedisAvailable()) {
    await redisSet(`alert:cooldown:${alertKey}`, Date.now(), ALERT_COOLDOWN_SECONDS);
  }
}

// ── Thresholds ──
const THRESHOLDS = {
  dbLatencyMs: 1000,
  redisLatencyMs: 100,
  chatSessionsPerHour: 500,
  redisCommandsPerDay: 8000,
  messagesPerHour: 2000,
};

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const alerts: string[] = [];

  // ── Check Redis ──
  const redisHealth = await redisHealthCheck();

  if (!redisHealth.available) {
    if (await shouldSendAlert('redis-down')) {
      await sendAdminAlert({
        level: 'critical',
        subject: 'Redis לא זמין',
        message: 'Redis לא מגיב. L2 cache ו-rate limiting מושבתים. יש לבדוק את Upstash.',
        adminEmails: ADMIN_EMAILS,
      });
      await markAlertSent('redis-down');
      alerts.push('redis-down');
    }
  } else if (redisHealth.latencyMs > THRESHOLDS.redisLatencyMs) {
    if (await shouldSendAlert('redis-slow')) {
      await sendAdminAlert({
        level: 'warning',
        subject: 'Redis latency גבוה',
        message: `Redis latency: ${redisHealth.latencyMs}ms (סף: ${THRESHOLDS.redisLatencyMs}ms). ביצועי cache עלולים להיפגע.`,
        adminEmails: ADMIN_EMAILS,
      });
      await markAlertSent('redis-slow');
      alerts.push('redis-slow');
    }
  }

  // ── Check Redis daily commands ──
  if (isRedisAvailable()) {
    const today = new Date().toISOString().slice(0, 10);
    const commandsToday = await redisGet<number>(`metrics:commands:${today}`) || 0;
    if (commandsToday > THRESHOLDS.redisCommandsPerDay) {
      if (await shouldSendAlert('redis-commands-limit')) {
        await sendAdminAlert({
          level: 'warning',
          subject: 'Redis מתקרב למגבלת Free tier',
          message: `${commandsToday.toLocaleString()} פקודות היום (מגבלה: 10,000). שקלו שדרוג ל-Upstash Pro.`,
          adminEmails: ADMIN_EMAILS,
        });
        await markAlertSent('redis-commands-limit');
        alerts.push('redis-commands-limit');
      }
    }
  }

  // ── Check DB latency ──
  const dbStart = Date.now();
  await supabase.from('accounts').select('id', { count: 'exact', head: true });
  const dbLatency = Date.now() - dbStart;

  if (dbLatency > THRESHOLDS.dbLatencyMs) {
    if (await shouldSendAlert('db-slow')) {
      await sendAdminAlert({
        level: 'warning',
        subject: 'Database latency גבוה',
        message: `DB latency: ${dbLatency}ms (סף: ${THRESHOLDS.dbLatencyMs}ms). המערכת עלולה להאט.`,
        details: `Query: SELECT count(*) FROM accounts\nLatency: ${dbLatency}ms`,
        adminEmails: ADMIN_EMAILS,
      });
      await markAlertSent('db-slow');
      alerts.push('db-slow');
    }
  }

  // ── Check chat activity ──
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: sessionsLastHour } = await supabase
    .from('chat_sessions')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', oneHourAgo);

  if ((sessionsLastHour || 0) > THRESHOLDS.chatSessionsPerHour) {
    if (await shouldSendAlert('high-traffic')) {
      await sendAdminAlert({
        level: 'warning',
        subject: 'תנועה גבוהה — מתקרבים לקיבולת',
        message: `${sessionsLastHour} סשנים בשעה האחרונה (סף: ${THRESHOLDS.chatSessionsPerHour}). שקלו שדרוג תשתית.`,
        details: `Sessions/hour: ${sessionsLastHour}\nThreshold: ${THRESHOLDS.chatSessionsPerHour}\nCurrent tier: Tier 0 (max 5,000 concurrent)`,
        adminEmails: ADMIN_EMAILS,
      });
      await markAlertSent('high-traffic');
      alerts.push('high-traffic');
    }
  }

  const { count: messagesLastHour } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', oneHourAgo);

  if ((messagesLastHour || 0) > THRESHOLDS.messagesPerHour) {
    if (await shouldSendAlert('high-messages')) {
      await sendAdminAlert({
        level: 'warning',
        subject: 'נפח הודעות גבוה',
        message: `${messagesLastHour} הודעות בשעה האחרונה. עומס גבוה על AI ו-DB.`,
        adminEmails: ADMIN_EMAILS,
      });
      await markAlertSent('high-messages');
      alerts.push('high-messages');
    }
  }

  return NextResponse.json({
    checked: new Date().toISOString(),
    dbLatencyMs: dbLatency,
    redisAvailable: redisHealth.available,
    sessionsLastHour: sessionsLastHour || 0,
    messagesLastHour: messagesLastHour || 0,
    alertsSent: alerts,
  });
}
