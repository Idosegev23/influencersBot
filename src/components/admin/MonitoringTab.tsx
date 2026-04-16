'use client';

import { useState, useEffect, useCallback } from 'react';

interface SystemHealth {
  timestamp: string;
  collectTimeMs: number;
  tier: {
    current: string;
    maxConcurrent: number;
    nextTier: { name: string; actions: string[] };
  };
  database: {
    latencyMs: number;
    counts: {
      accounts: number;
      chatSessions: number;
      chatMessages: number;
      documentChunks: number;
    };
    activity: {
      sessionsLastHour: number;
      messagesLastHour: number;
    };
  };
  redis: {
    available: boolean;
    latencyMs: number;
    commandsToday: number;
  };
  cache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } | null;
  growth: {
    sessionsPerDay: Record<string, number>;
    topAccounts: { username: string; sessions: number }[];
    totalSessionsLast7d: number;
    previousWeekSessions: number;
    growthPercent: number | null;
  };
  alerts: { level: 'info' | 'warning' | 'critical'; message: string }[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="neon-card p-4 rounded-2xl">
      <p className="text-xs text-[#9ca3af] mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: color || '#1f2937' }}>{value}</p>
      {sub && <p className="text-xs text-[#9ca3af] mt-1">{sub}</p>}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ background: ok ? '#22c55e' : '#ef4444', boxShadow: ok ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }}
    />
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-2 rounded-full bg-[#f3f4f6] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function MonitoringTab() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testEmailSent, setTestEmailSent] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const sendTestEmail = async () => {
    setTestEmailSent(false);
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      if (res.ok) setTestEmailSent(true);
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-2">שגיאה בטעינת נתונים</p>
        <p className="text-sm text-[#9ca3af]">{error}</p>
        <button onClick={fetchHealth} className="mt-4 neon-pill neon-pill-primary px-4 py-2 text-sm">נסה שוב</button>
      </div>
    );
  }

  const days = Object.entries(data.growth.sessionsPerDay).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDayValue = Math.max(...days.map(([, v]) => v), 1);

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {data.alerts.some(a => a.level !== 'info') && (
        <div className="space-y-2">
          {data.alerts.filter(a => a.level !== 'info').map((alert, i) => (
            <div
              key={i}
              className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
              style={{
                background: alert.level === 'critical' ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${alert.level === 'critical' ? '#fecaca' : '#fde68a'}`,
                color: alert.level === 'critical' ? '#991b1b' : '#92400e',
              }}
            >
              <span>{alert.level === 'critical' ? '🔴' : '🟡'}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tier Info */}
      <div className="neon-card p-5 rounded-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-[#9ca3af]">שלב נוכחי</p>
          <p className="text-lg font-bold" style={{ color: '#883fe2' }}>{data.tier.current}</p>
          <p className="text-xs text-[#9ca3af] mt-1">קיבולת: עד {data.tier.maxConcurrent.toLocaleString()} מבקרים בו-זמנית</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-[#9ca3af] mb-1">שלב הבא: {data.tier.nextTier.name}</p>
          {data.tier.nextTier.actions.map((action, i) => (
            <p key={i} className="text-xs text-[#6b7280]">• {action}</p>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="חשבונות" value={data.database.counts.accounts} />
        <StatCard label="סשנים (7 ימים)" value={data.growth.totalSessionsLast7d.toLocaleString()} sub={
          data.growth.growthPercent !== null
            ? `${data.growth.growthPercent > 0 ? '+' : ''}${data.growth.growthPercent}% מהשבוע הקודם`
            : undefined
        } color={data.growth.growthPercent && data.growth.growthPercent > 0 ? '#22c55e' : undefined} />
        <StatCard label="הודעות (שעה)" value={data.database.activity.messagesLastHour} />
        <StatCard label="סשנים (שעה)" value={data.database.activity.sessionsLastHour} />
      </div>

      {/* Services Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Database */}
        <div className="neon-card p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <StatusDot ok={data.database.latencyMs < 1000} />
              <span className="font-medium text-sm">מסד נתונים</span>
            </div>
            <span className="text-xs text-[#9ca3af]">{data.database.latencyMs}ms</span>
          </div>
          <div className="space-y-2 text-xs text-[#6b7280]">
            <div className="flex justify-between"><span>הודעות צ׳אט</span><span>{data.database.counts.chatMessages.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>סשנים</span><span>{data.database.counts.chatSessions.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Document chunks</span><span>{data.database.counts.documentChunks.toLocaleString()}</span></div>
          </div>
        </div>

        {/* Redis */}
        <div className="neon-card p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <StatusDot ok={data.redis.available} />
              <span className="font-medium text-sm">Redis Cache</span>
            </div>
            <span className="text-xs text-[#9ca3af]">{data.redis.available ? `${data.redis.latencyMs}ms` : 'לא פעיל'}</span>
          </div>
          {data.redis.available ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[#6b7280]">
                <span>פקודות היום</span>
                <span>{data.redis.commandsToday.toLocaleString()} / 10,000</span>
              </div>
              <MiniBar value={data.redis.commandsToday} max={10000} color={data.redis.commandsToday > 8000 ? '#ef4444' : '#883fe2'} />
            </div>
          ) : (
            <p className="text-xs text-red-500">Redis לא מחובר — L2 cache מושבת</p>
          )}
        </div>
      </div>

      {/* L1 Cache */}
      {data.cache && (
        <div className="neon-card p-5 rounded-2xl">
          <p className="font-medium text-sm mb-3">L1 Cache (זיכרון)</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold" style={{ color: '#883fe2' }}>{Math.round(data.cache.hitRate * 100)}%</p>
              <p className="text-xs text-[#9ca3af]">Hit Rate</p>
            </div>
            <div>
              <p className="text-xl font-bold">{data.cache.size.toLocaleString()}</p>
              <p className="text-xs text-[#9ca3af]">פריטים</p>
            </div>
            <div>
              <p className="text-xl font-bold">{(data.cache.hits + data.cache.misses).toLocaleString()}</p>
              <p className="text-xs text-[#9ca3af]">שאילתות</p>
            </div>
          </div>
          <div className="mt-3">
            <MiniBar value={data.cache.size} max={data.cache.maxSize} color="#883fe2" />
            <p className="text-[10px] text-[#9ca3af] mt-1 text-left">{data.cache.size} / {data.cache.maxSize}</p>
          </div>
        </div>
      )}

      {/* Growth Chart (simple bars) */}
      <div className="neon-card p-5 rounded-2xl">
        <p className="font-medium text-sm mb-4">סשנים ב-7 ימים אחרונים</p>
        <div className="flex items-end gap-1 h-24">
          {days.map(([day, count]) => (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-[#9ca3af]">{count}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max((count / maxDayValue) * 80, 4)}px`,
                  background: 'linear-gradient(to top, #883fe2, #a855f7)',
                }}
              />
              <span className="text-[10px] text-[#9ca3af]">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Accounts */}
      {data.growth.topAccounts.length > 0 && (
        <div className="neon-card p-5 rounded-2xl">
          <p className="font-medium text-sm mb-3">חשבונות פעילים (7 ימים)</p>
          <div className="space-y-2">
            {data.growth.topAccounts.map((account, i) => (
              <div key={account.username} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#9ca3af] w-4">{i + 1}.</span>
                  <span className="font-medium">{account.username}</span>
                </div>
                <span className="text-[#6b7280]">{account.sessions} סשנים</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={fetchHealth} className="neon-pill neon-pill-ghost flex items-center gap-2 px-4 py-2 text-sm">
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          רענון
        </button>
        <button onClick={sendTestEmail} className="neon-pill neon-pill-ghost flex items-center gap-2 px-4 py-2 text-sm">
          <span className="material-symbols-outlined text-[16px]">mail</span>
          {testEmailSent ? '✓ נשלח!' : 'שלח מייל בדיקה'}
        </button>
        <span className="text-[10px] text-[#9ca3af] self-center">
          עדכון אחרון: {new Date(data.timestamp).toLocaleTimeString('he-IL')} ({data.collectTimeMs}ms)
        </span>
      </div>
    </div>
  );
}
