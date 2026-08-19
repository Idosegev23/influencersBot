'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkline } from '@/components/ui/sparkline';
import { Card } from '@/components/ui/card';

const STATUS_META: Record<string, { icon: string; label: string; cls: string }> = {
  never_installed: { icon: '⚪', label: 'לא הותקן', cls: 'bg-gray-100 text-gray-700' },
  silent:          { icon: '🔴', label: 'נדם',      cls: 'bg-red-100 text-red-800' },
  erroring:        { icon: '🟠', label: 'שגיאות',   cls: 'bg-orange-100 text-orange-800' },
  dormant:         { icon: '🟡', label: 'דועך',     cls: 'bg-amber-100 text-amber-800' },
  live:            { icon: '🟢', label: 'חי',       cls: 'bg-emerald-100 text-emerald-800' },
};

const CHANNEL_LABEL: Record<string, string> = {
  widget: 'ווידג׳ט', chat_page: 'עמוד צ׳אט', whatsapp: 'וואטסאפ', instagram: 'אינסטגרם',
};

// Channel-level `lastSeen` (from admin_health_board / account_health_daily)
// is a DATE, not a timestamp — Ruling R5: it is max(h.date), deliberately not
// max(h.computed_at), because computed_at is when the nightly cron ran and is
// near-identical for every row in a batch. Format it as a plain day, parsed
// by hand rather than through `new Date(...).toLocaleString()`, which would
// (a) invent a midnight that never happened and (b) can shift the displayed
// day across a UTC/local timezone boundary.
function formatDay(day: string | null): string {
  if (!day) return 'מעולם לא';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

export default function HealthPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/admin/health');
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j?.error || 'failed');
        setRows(j.rows || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Fix round 1, Finding 2: the original toggle() had no try/catch and no
  // else branch — a thrown fetch() became an unhandled promise rejection,
  // and a non-ok response left `detail[accountId]` unset forever, so
  // "טוען פירוט…" displayed indefinitely with no error and no way to
  // retry. loadDetail() is the single place that fetches and always lands
  // in either `detail` or `detailError`, never neither.
  async function loadDetail(accountId: string) {
    setDetailError((d) => {
      if (!(accountId in d)) return d;
      const { [accountId]: _drop, ...rest } = d;
      return rest;
    });
    try {
      const r = await fetch(`/api/admin/health/${accountId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'failed');
      setDetail((d) => ({ ...d, [accountId]: j }));
    } catch (e: any) {
      setDetailError((d) => ({ ...d, [accountId]: e?.message || 'טעינת הפירוט נכשלה' }));
    }
  }

  function toggle(accountId: string) {
    if (openId === accountId) { setOpenId(null); return; }
    setOpenId(accountId);
    if (detail[accountId]) return;
    loadDetail(accountId);
  }

  // A brand-new paying customer with no account_health_daily rows yet (before
  // the first nightly cron) comes back with an empty `channels` array. That
  // must count as "needs attention", not read as the healthiest account on
  // the board just because `.some()` over an empty array is false.
  const atRisk = useMemo(
    () => rows.filter((r) => r.channels.length === 0 || r.channels.some((c: any) => c.status !== 'live')).length,
    [rows],
  );

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">בריאות לקוחות</h1>
            <p className="text-sm text-gray-500">
              {loading ? 'טוען…' : `${rows.length} לקוחות משלמים · ${atRisk} דורשים תשומת לב`}
            </p>
          </div>
          <Link href="/admin/analytics" className="text-blue-600 hover:underline text-sm">
            אנליטיקס →
          </Link>
        </header>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {!loading && rows.length === 0 && (
          <Card className="p-6 text-center text-gray-500 text-sm">
            אין עדיין שורות ב־<code>account_contracts</code>. הוסיפו לקוחות משלמים כדי שהלוח יתמלא.
          </Card>
        )}

        {rows.map((r) => {
          // The detail route returns one row per account+origin+DAY (up to the
          // 30-day window), not one row per unique origin — an actively pinging
          // origin can appear many times. It's already ordered last_seen_at
          // desc, so keeping the first occurrence per origin gives the latest
          // ping per origin without a second network round trip or touching
          // the Task 9 API. This is what lets a dozen-origin account (LA
          // BEAUTÉ: 3, LDRS: 2) render as a dozen rows, not a wall of
          // near-duplicate daily pings.
          const rawOrigins: any[] = detail[r.accountId]?.origins || [];
          const seenOrigins = new Set<string>();
          const origins = rawOrigins.filter((o: any) => {
            if (seenOrigins.has(o.origin)) return false;
            seenOrigins.add(o.origin);
            return true;
          });

          return (
            <Card key={r.accountId} className="overflow-hidden">
              <button
                onClick={() => toggle(r.accountId)}
                className="w-full text-right p-4 hover:bg-gray-50 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    {r.owner || '—'}
                    {r.trialEnd && ` · טרייל עד ${r.trialEnd}`}
                    {r.contractEnd && ` · חוזה עד ${r.contractEnd}`}
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap items-start">
                  {r.channels.length === 0 && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500">
                      ⚪ אין עדיין נתונים
                    </span>
                  )}
                  {r.channels.map((c: any) => {
                    const m = STATUS_META[c.status] || STATUS_META.never_installed;
                    // Belt and braces alongside the RPC-side coalesce (fix
                    // round 1, Finding 1): the RPC now always returns 0 for a
                    // channel with no rows in the trailing 7 days, but the
                    // TS side never enforced that contract (HealthRow types
                    // these as `number`, not `number | null`), so guard here
                    // too rather than trust it silently forever.
                    const opens7d = c.opens7d ?? 0;
                    const loads7d = c.loads7d ?? 0;
                    const errors7d = c.errors7d ?? 0;
                    return (
                      <div key={c.channel} className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${m.cls}`}>
                          {m.icon} {CHANNEL_LABEL[c.channel] || c.channel} · {m.label}
                          {c.status === 'dormant' && loads7d > 0 &&
                            ` (${((opens7d / loads7d) * 100).toFixed(1)}%)`}
                          {c.status === 'erroring' && ` (${errors7d})`}
                        </span>
                        {/* Evidence, subordinate to the chip's verdict above: the
                            14-day daily-loads trend plus the last day the channel
                            actually showed signs of life. */}
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <span>{formatDay(c.lastSeen)}</span>
                          <Sparkline values={c.spark} width={48} height={14} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>

              {openId === r.accountId && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 text-sm space-y-4">
                  {!detail[r.accountId] && !detailError[r.accountId] && (
                    <div className="text-gray-400">טוען פירוט…</div>
                  )}
                  {detailError[r.accountId] && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs flex items-center justify-between gap-3">
                      <span>שגיאה בטעינת הפירוט: {detailError[r.accountId]}</span>
                      <button
                        onClick={() => loadDetail(r.accountId)}
                        className="px-2 py-1 rounded bg-white border border-red-200 hover:bg-red-100 shrink-0"
                      >
                        נסו שוב
                      </button>
                    </div>
                  )}
                  {detail[r.accountId] && (
                    <>
                      <section>
                        <h3 className="font-medium mb-2">
                          איפה אנחנו רצים {origins.length > 0 && `(${origins.length})`}
                        </h3>
                        {origins.length === 0 && (
                          <div className="text-gray-400">אף פינג — הסניפט לא הודבק.</div>
                        )}
                        {origins.length > 0 && (
                          <ul className="space-y-1 max-h-56 overflow-y-auto">
                            {origins.map((o: any) => (
                              <li key={o.origin} className="flex justify-between gap-4">
                                <span className="font-mono text-xs truncate">{o.origin}{o.samplePath}</span>
                                <span className="text-gray-500 text-xs whitespace-nowrap">
                                  {new Date(o.lastSeen).toLocaleString('he-IL')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

                      <section>
                        <h3 className="font-medium mb-2">גרסאות סקריפט</h3>
                        {detail[r.accountId].versions.length === 0 && (
                          <div className="text-gray-400">אין נתוני גרסה.</div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {detail[r.accountId].versions.map((v: any) => (
                            <span key={v.version} className="px-2 py-1 rounded bg-white border text-xs">
                              {v.version}
                            </span>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="font-medium mb-2">
                          שגיאות אחרונות ({detail[r.accountId].errors.length})
                        </h3>
                        {detail[r.accountId].errors.length === 0 && (
                          <div className="text-gray-400">אין שגיאות ב־30 הימים האחרונים.</div>
                        )}
                        <ul className="space-y-2">
                          {detail[r.accountId].errors.slice(0, 10).map((e: any, i: number) => (
                            <li key={i} className="bg-white border rounded p-2">
                              <div className="flex justify-between gap-2">
                                <span className="font-mono text-xs text-red-700">{e.type}</span>
                                <span className="text-gray-400 text-xs whitespace-nowrap">
                                  {new Date(e.at).toLocaleString('he-IL')}
                                </span>
                              </div>
                              <div className="text-xs mt-1">{e.message}</div>
                              {e.stack && (
                                <pre className="text-[10px] text-gray-500 mt-1 overflow-x-auto max-h-32 overflow-y-auto">
                                  {e.stack}
                                </pre>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
