import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { redisHealthCheck, isRedisAvailable, redisGet } from '@/lib/redis';
import { cacheGetStats } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Tier thresholds ──
const TIERS = {
  current: {
    name: 'Tier 0 — Startup',
    maxConcurrent: 5000,
    thresholds: {
      redisCommandsPerDay: 8000,
      dbLatencyMs: 1000,
      redisLatencyMs: 100,
      chatSessionsPerHour: 500,
    },
  },
  next: {
    name: 'Tier 1 — Growth',
    actions: [
      'שדרוג Upstash ל-Pro ($20/חודש)',
      'הפעלת Supabase connection pooling',
      'איחוד Supabase clients',
    ],
  },
};

// ── Metric collectors ──

async function getDbMetrics() {
  const start = Date.now();

  const [accounts, sessions, messages, chunks] = await Promise.all([
    supabase.from('accounts').select('id', { count: 'exact', head: true }),
    supabase.from('chat_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
    supabase.from('document_chunks').select('id', { count: 'exact', head: true }),
  ]);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [recentSessions, recentMessages] = await Promise.all([
    supabase.from('chat_sessions').select('id', { count: 'exact', head: true }).gt('created_at', oneHourAgo),
    supabase.from('chat_messages').select('id', { count: 'exact', head: true }).gt('created_at', oneHourAgo),
  ]);

  return {
    latencyMs: Date.now() - start,
    counts: {
      accounts: accounts.count || 0,
      chatSessions: sessions.count || 0,
      chatMessages: messages.count || 0,
      documentChunks: chunks.count || 0,
    },
    activity: {
      sessionsLastHour: recentSessions.count || 0,
      messagesLastHour: recentMessages.count || 0,
    },
  };
}

async function getRedisMetrics() {
  const health = await redisHealthCheck();
  if (!health.available) {
    return { available: false, latencyMs: 0, commandsToday: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  const commandsToday = await redisGet<number>(`metrics:commands:${today}`) || 0;

  return {
    available: true,
    latencyMs: health.latencyMs,
    commandsToday,
  };
}

async function getGrowthMetrics() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: dailySessions } = await supabase
    .from('chat_sessions')
    .select('created_at, account_id')
    .gt('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true });

  // Sessions per day
  const byDay: Record<string, number> = {};
  const accountCounts: Record<string, number> = {};

  for (const s of (dailySessions || [])) {
    const day = s.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
    if (s.account_id) accountCounts[s.account_id] = (accountCounts[s.account_id] || 0) + 1;
  }

  // Top 5 accounts
  const topAccountEntries = Object.entries(accountCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topAccountIds = topAccountEntries.map(([id]) => id);
  let nameMap: Record<string, string> = {};

  if (topAccountIds.length > 0) {
    const { data: accountNames } = await supabase
      .from('accounts')
      .select('id, config')
      .in('id', topAccountIds);

    for (const a of (accountNames || [])) {
      nameMap[a.id] = a.config?.username || a.id;
    }
  }

  // Growth trend: compare this week vs last week
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { count: lastWeekSessions } = await supabase
    .from('chat_sessions')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', fourteenDaysAgo)
    .lte('created_at', sevenDaysAgo);

  const thisWeekTotal = Object.values(byDay).reduce((a, b) => a + b, 0);
  const growthPercent = lastWeekSessions && lastWeekSessions > 0
    ? Math.round(((thisWeekTotal - lastWeekSessions) / lastWeekSessions) * 100)
    : null;

  return {
    sessionsPerDay: byDay,
    topAccounts: topAccountEntries.map(([id, count]) => ({
      username: nameMap[id] || id,
      sessions: count,
    })),
    totalSessionsLast7d: thisWeekTotal,
    previousWeekSessions: lastWeekSessions || 0,
    growthPercent,
  };
}

// ── Evaluate alerts ──
function evaluateAlerts(db: Awaited<ReturnType<typeof getDbMetrics>>, redis: Awaited<ReturnType<typeof getRedisMetrics>>, growth: Awaited<ReturnType<typeof getGrowthMetrics>>) {
  const alerts: { level: 'info' | 'warning' | 'critical'; message: string }[] = [];
  const t = TIERS.current.thresholds;

  // Redis
  if (!redis.available) {
    alerts.push({ level: 'critical', message: 'Redis לא זמין. L2 cache ו-rate limiting מושבתים.' });
  } else {
    if (redis.commandsToday > t.redisCommandsPerDay) {
      alerts.push({ level: 'critical', message: `Redis commands היום (${redis.commandsToday}) חורגים מהסף (${t.redisCommandsPerDay}). שדרגו ל-Upstash Pro.` });
    } else if (redis.commandsToday > t.redisCommandsPerDay * 0.6) {
      alerts.push({ level: 'warning', message: `Redis commands ב-${Math.round(redis.commandsToday / t.redisCommandsPerDay * 100)}% מהמגבלה היומית.` });
    }
    if (redis.latencyMs > t.redisLatencyMs) {
      alerts.push({ level: 'warning', message: `Redis latency גבוה: ${redis.latencyMs}ms.` });
    }
  }

  // DB
  if (db.latencyMs > t.dbLatencyMs) {
    alerts.push({ level: 'warning', message: `Database latency גבוה: ${db.latencyMs}ms.` });
  }

  // Chat activity
  if (db.activity.sessionsLastHour > t.chatSessionsPerHour) {
    alerts.push({ level: 'warning', message: `${db.activity.sessionsLastHour} sessions בשעה האחרונה — מתקרבים לקיבולת.` });
  }

  // Growth
  if (growth.growthPercent !== null && growth.growthPercent > 100) {
    alerts.push({ level: 'info', message: `צמיחה של ${growth.growthPercent}% מהשבוע הקודם. עקבו אחרי הביצועים.` });
  }

  // All good
  if (alerts.length === 0) {
    alerts.push({ level: 'info', message: 'כל המערכות תקינות.' });
  }

  return alerts;
}

// ── Main endpoint ──

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const start = Date.now();

  const [db, redis, growth] = await Promise.all([
    getDbMetrics(),
    getRedisMetrics(),
    getGrowthMetrics(),
  ]);

  const cache = cacheGetStats();
  const alerts = evaluateAlerts(db, redis, growth);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    collectTimeMs: Date.now() - start,
    tier: {
      current: TIERS.current.name,
      maxConcurrent: TIERS.current.maxConcurrent,
      nextTier: TIERS.next,
    },
    database: db,
    redis,
    cache,
    growth,
    alerts,
  });
}
