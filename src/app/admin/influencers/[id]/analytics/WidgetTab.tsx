'use client';

/**
 * Widget analytics tab — everything we can show about an account's embedded
 * widget from our own data: purchase conversions (Bestie revenue),
 * recommendation volume/CTR, top products, engagement events, and the
 * store-API connection form.
 */

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/admin/KpiCard';
import StoreIntegrationForm from './StoreIntegrationForm';

interface WidgetSummary {
  days: number;
  analyticsConfigured?: boolean;
  recommendations: {
    totalRecs: number;
    totalClicks: number;
    ctr: number;
    strategyBreakdown: Array<{ strategy: string; count: number; clicks: number; ctr: number }>;
    topProducts: Array<{ name: string; count: number; clicks: number }>;
  };
  productCount: number;
  sessionCount: number;
  engagement: {
    active: boolean;
    events: Array<{ type: string; count: number }>;
  };
  conversions: {
    enabled: boolean;
    totalOrders: number;
    attributedOrders: number;
    attributedRevenue: number;
    byTier: Record<string, { count: number; revenue: number }>;
    recent: Array<{
      order_number: string;
      total: number | null;
      attribution: string;
      line_items: Array<{ name: string }> | null;
      customer: { firstName?: string; lastName?: string; email?: string } | null;
      occurred_at: string;
    }>;
  };
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: 'ישיר (לחץ וקנה)', color: '#10b981' },
  assisted: { label: 'בסיוע (הומלץ וקנה)', color: '#6366f1' },
  influenced: { label: 'השפעה (שוחח וקנה)', color: '#a855f7' },
  none: { label: 'ללא שיחה', color: '#9ca3af' },
};

const EVENT_LABELS: Record<string, string> = {
  widget_loaded: 'נטען',
  widget_opened: 'נפתח',
  widget_closed: 'נסגר',
  widget_proactive_opened: 'נפתח יזום',
  widget_message_sent: 'הודעת משתמש',
  widget_message_received: 'תשובת בוט',
  widget_product_click: 'קליק על מוצר',
  widget_chip_clicked: 'קליק על צ׳יפ',
  widget_support_opened: 'תמיכה נפתחה',
  widget_support_success: 'פנייה נשלחה',
  widget_lead_success: 'ליד נשלח',
  widget_conversion_detected: 'רכישה זוהתה',
};

function ils(n: number) {
  return '₪' + Math.round(n || 0).toLocaleString('he-IL');
}
function fmt(n: number | undefined) {
  return n == null ? '—' : n.toLocaleString('he-IL');
}

export default function WidgetTab({
  accountId,
  days,
  domain,
}: {
  accountId: string;
  days: number;
  domain: string | null;
}) {
  const [data, setData] = useState<WidgetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/analytics/widget-summary?accountId=${accountId}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, days]);

  const rec = data?.recommendations;
  const conv = data?.conversions;

  return (
    <div className="space-y-6">
      {/* Pipeline health banner. Distinguishes a real misconfiguration
          (secret missing → token can't be signed) from the normal
          "deployed, just waiting for live traffic" state. */}
      {data && data.analyticsConfigured === false && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900">
          <strong>אנליטיקס הווידג'ט מושבת.</strong> לא ניתן לחתום טוקן —{' '}
          <code className="text-xs">ANALYTICS_WIDGET_SECRET</code> חסר בסביבת הפרודקשן, ולכן הווידג'ט לא שולח אירועים.
          יש להגדיר את המשתנה ולפרוס מחדש.
        </div>
      )}
      {data && data.analyticsConfigured !== false && !data.engagement.active && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900">
          <strong>ממתין לתנועה חיה.</strong> השליחה מהווידג'ט פעילה, אך עדיין לא נקלטו אירועי engagement
          בזמן-אמת בתקופה זו — הם יצטברו כאן ככל שגולשים יתקשרו עם הווידג'ט. המספרים למטה (כולל שחזור היסטורי) מעודכנים.
        </div>
      )}

      {/* ---- Conversions (Bestie revenue) ---- */}
      <section>
        <h2 className="text-sm font-semibold mb-3">💰 הכנסות בסטי</h2>
        {!conv?.enabled ? (
          <Card className="p-4 text-sm text-gray-500">
            מעקב רכישות עדיין לא הופעל (טבלת <code className="text-xs">widget_conversions</code> טרם נוצרה).
            לאחר הפעלת הצינור, כאן יוצגו הזמנות שזוהו ויוחסו לשיחות.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <KpiCard label="הכנסה מיוחסת" value={ils(conv.attributedRevenue)} loading={loading} />
              <KpiCard label="הזמנות מיוחסות" value={fmt(conv.attributedOrders)} loading={loading} />
              <KpiCard label="סה״כ הזמנות שזוהו" value={fmt(conv.totalOrders)} loading={loading} />
              <KpiCard
                label="שיעור ייחוס"
                value={conv.totalOrders ? `${Math.round((conv.attributedOrders / conv.totalOrders) * 100)}%` : '—'}
                loading={loading}
              />
            </div>
            <Card className="p-4">
              <div className="space-y-1.5 mb-3">
                {Object.entries(TIER_LABELS).map(([tier, t]) => {
                  const row = conv.byTier?.[tier];
                  if (!row) return null;
                  return (
                    <div key={tier} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                        {t.label}
                      </span>
                      <span className="font-mono">{row.count} · {ils(row.revenue)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t pt-2 space-y-2 max-h-72 overflow-y-auto">
                {conv.recent.map((o, i) => (
                  <div key={i} className="flex items-start justify-between text-xs gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">
                        #{o.order_number} · {ils(Number(o.total) || 0)}
                        <span
                          className="mr-2 px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: '#f3f4f6', color: TIER_LABELS[o.attribution]?.color }}
                        >
                          {TIER_LABELS[o.attribution]?.label || o.attribution}
                        </span>
                      </div>
                      <div className="text-gray-500 truncate">
                        {(o.line_items || []).map((li) => li.name).join(', ')}
                      </div>
                    </div>
                    <span className="text-gray-400 whitespace-nowrap">
                      {new Date(o.occurred_at).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                ))}
                {conv.recent.length === 0 && <div className="text-gray-400 text-xs">אין הזמנות בתקופה</div>}
              </div>
            </Card>
          </>
        )}
      </section>

      {/* ---- Recommendations ---- */}
      <section>
        <h2 className="text-sm font-semibold mb-3">🛍️ המלצות מוצרים</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiCard label="המלצות" value={fmt(rec?.totalRecs)} loading={loading} />
          <KpiCard label="קליקים" value={fmt(rec?.totalClicks)} loading={loading} />
          <KpiCard label="CTR" value={rec ? `${rec.ctr}%` : '—'} loading={loading} />
          <KpiCard label="מוצרים בקטלוג" value={fmt(data?.productCount)} loading={loading} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-2">מוצרים מומלצים מובילים</h3>
            <ul className="space-y-1 text-xs max-h-72 overflow-y-auto">
              {(rec?.topProducts || []).map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className="text-gray-500 font-mono whitespace-nowrap">
                    {p.count} המלצות{p.clicks ? ` · ${p.clicks} קליקים` : ''}
                  </span>
                </li>
              ))}
              {!rec?.topProducts?.length && <li className="text-gray-400">—</li>}
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-2">לפי אסטרטגיה</h3>
            <ul className="space-y-1 text-xs max-h-72 overflow-y-auto">
              {(rec?.strategyBreakdown || []).map((s, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{s.strategy}</span>
                  <span className="text-gray-500 font-mono whitespace-nowrap">
                    {s.count} · CTR {s.ctr}%
                  </span>
                </li>
              ))}
              {!rec?.strategyBreakdown?.length && <li className="text-gray-400">—</li>}
            </ul>
          </Card>
        </div>
      </section>

      {/* ---- Engagement events ---- */}
      <section>
        <h2 className="text-sm font-semibold mb-3">💬 פעילות בווידג'ט</h2>
        <Card className="p-4">
          {data?.engagement.events.length ? (
            <>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                {data.engagement.events.map((e) => (
                  <li key={e.type} className="flex justify-between gap-2">
                    <span className="truncate">{EVENT_LABELS[e.type] || e.type}</span>
                    <span className="text-gray-500 font-mono">{e.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-gray-400">אין אירועי engagement בתקופה זו.</p>
          )}
        </Card>
      </section>

      {/* ---- Store API connection ---- */}
      <section>
        <StoreIntegrationForm accountId={accountId} />
      </section>

      {domain && (
        <p className="text-xs text-gray-400">
          דומיין הווידג'ט:{' '}
          <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="underline" dir="ltr">
            {domain}
          </a>
        </p>
      )}
    </div>
  );
}
