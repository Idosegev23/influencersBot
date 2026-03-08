'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

type ProjectSummary = {
  partnership: any;
  tasks: any;
  deliverables: any;
  roi: any;
  coupons: any;
  timeline: any;
  generated_at: string;
};

export default function ProjectSummaryClient({
  params
}: {
  params: Promise<{ username: string; id: string }>
}) {
  const { username, id } = use(params);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, [id]);

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/influencer/partnerships/${id}/summary`);
      if (!res.ok) throw new Error('Failed to fetch summary');

      const data = await res.json();
      setSummary(data.summary);
      setInsights(data.insights);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // In a real implementation, this would generate a PDF
      // For now, we'll just trigger a print dialog
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8" style={{ background: 'var(--dash-bg)' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-1/3" style={{ background: 'var(--dash-surface)' }}></div>
          <div className="h-64 rounded" style={{ background: 'var(--dash-surface)' }}></div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 text-center" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
        <p style={{ color: 'var(--dash-text-2)' }}>לא ניתן לטעון את הסיכום</p>
        <Link href={`/influencer/${username}/partnerships`} className="mt-4 inline-block" style={{ color: 'var(--color-primary)' }}>
          חזרה לשת"פים
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between print:mb-4">
          <div>
            <Link
              href={`/influencer/${username}/partnerships/${id}`}
              className="mb-2 inline-block print:hidden"
              style={{ color: 'var(--color-primary)' }}
            >
              חזרה לשת"פ
            </Link>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>סיכום פרויקט</h1>
            <p className="mt-1" style={{ color: 'var(--dash-text-2)' }}>
              {summary.partnership.brand_name} - {summary.partnership.campaign_name}
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-3 rounded-lg print:hidden"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {isExporting ? 'מייצא...' : 'ייצא ל-PDF'}
          </button>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="rounded-xl border p-6 mb-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--color-info)' }}>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-info)' }}>תובנות ומסקנות</h2>
            <ul className="space-y-2">
              {insights.map((insight, idx) => (
                <li key={idx} style={{ color: 'var(--dash-text-2)' }}>{insight}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Tasks Summary */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>משימות</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span style={{ color: 'var(--dash-text-2)' }}>סה"כ</span>
                <span className="font-bold" style={{ color: 'var(--dash-text)' }}>{summary.tasks.total}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--dash-positive)' }}>הושלמו</span>
                <span className="font-bold" style={{ color: 'var(--dash-positive)' }}>{summary.tasks.completed}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-primary)' }}>בביצוע</span>
                <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{summary.tasks.in_progress}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-warning)' }}>ממתינות</span>
                <span className="font-bold" style={{ color: 'var(--color-warning)' }}>{summary.tasks.pending}</span>
              </div>
              {summary.tasks.overdue > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dash-negative)' }}>באיחור</span>
                  <span className="font-bold" style={{ color: 'var(--dash-negative)' }}>{summary.tasks.overdue}</span>
                </div>
              )}
              <div className="pt-3 border-t" style={{ borderColor: 'var(--dash-border)' }}>
                <div className="flex justify-between text-lg font-semibold">
                  <span style={{ color: 'var(--dash-text)' }}>אחוז השלמה</span>
                  <span style={{ color: 'var(--dash-positive)' }}>{summary.tasks.completion_rate}%</span>
                </div>
                <div className="mt-2 h-3 rounded-full overflow-hidden" style={{ background: 'var(--dash-surface-hover)' }}>
                  <div
                    className="h-full transition-all"
                    style={{ width: `${summary.tasks.completion_rate}%`, background: 'var(--dash-positive)' }}
                  ></div>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--dash-text-2)' }}>השלמה בזמן</span>
                <span className="font-medium" style={{ color: 'var(--dash-text)' }}>{summary.tasks.on_time_completion_rate}%</span>
              </div>
            </div>
          </div>

          {/* ROI Summary */}
          {summary.roi && (
            <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>ROI וביצועים</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dash-text-2)' }}>השקעה</span>
                  <span className="font-bold" style={{ color: 'var(--dash-text)' }}>₪{summary.roi.investment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dash-positive)' }}>הכנסות</span>
                  <span className="font-bold" style={{ color: 'var(--dash-positive)' }}>₪{summary.roi.revenue.toLocaleString()}</span>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: 'var(--dash-border)' }}>
                  <div className="flex justify-between text-lg font-semibold">
                    <span style={{ color: 'var(--dash-text)' }}>ROI</span>
                    <span style={{ color: summary.roi.roi_percentage > 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                      {summary.roi.roi_percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--dash-border)' }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--dash-text-2)' }}>חשיפות</span>
                    <span style={{ color: 'var(--dash-text)' }}>{summary.roi.total_impressions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--dash-text-2)' }}>קליקים</span>
                    <span style={{ color: 'var(--dash-text)' }}>{summary.roi.total_clicks.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--dash-text-2)' }}>המרות</span>
                    <span style={{ color: 'var(--dash-text)' }}>{summary.roi.total_conversions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span style={{ color: 'var(--dash-text-2)' }}>שיעור המרה</span>
                    <span style={{ color: 'var(--color-primary)' }}>{summary.roi.conversion_rate.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Coupons Summary */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>קופונים</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span style={{ color: 'var(--dash-text-2)' }}>סה"כ קופונים</span>
                <span className="font-bold" style={{ color: 'var(--dash-text)' }}>{summary.coupons.total}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-primary)' }}>שימושים</span>
                <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{summary.coupons.total_usages}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--dash-positive)' }}>הכנסות מקופונים</span>
                <span className="font-bold" style={{ color: 'var(--dash-positive)' }}>₪{summary.coupons.total_revenue.toLocaleString()}</span>
              </div>

              {summary.coupons.top_coupons.length > 0 && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--dash-border)' }}>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>קופונים מובילים</h3>
                  <div className="space-y-2">
                    {summary.coupons.top_coupons.map((coupon: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span style={{ color: 'var(--dash-text-2)' }}>{coupon.code}</span>
                        <div className="text-left">
                          <span className="font-medium" style={{ color: 'var(--dash-text)' }}>{coupon.usage_count} שימושים</span>
                          <span className="mx-2" style={{ color: 'var(--dash-text-3)' }}>-</span>
                          <span style={{ color: 'var(--dash-positive)' }}>₪{coupon.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>ציר זמן</h2>
            <div className="space-y-3">
              {summary.partnership.start_date && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dash-text-2)' }}>תאריך התחלה</span>
                  <span className="font-medium" style={{ color: 'var(--dash-text)' }}>
                    {format(new Date(summary.partnership.start_date), 'dd/MM/yyyy', { locale: he })}
                  </span>
                </div>
              )}
              {summary.partnership.end_date && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dash-text-2)' }}>תאריך סיום</span>
                  <span className="font-medium" style={{ color: 'var(--dash-text)' }}>
                    {format(new Date(summary.partnership.end_date), 'dd/MM/yyyy', { locale: he })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--dash-text-2)' }}>משך הפרויקט</span>
                <span className="font-bold" style={{ color: 'var(--dash-text)' }}>{summary.timeline.duration_days} ימים</span>
              </div>
              {summary.timeline.days_remaining !== null && (
                <div className="flex justify-between">
                  <span style={{ color: summary.timeline.is_overdue ? 'var(--dash-negative)' : 'var(--color-primary)' }}>
                    {summary.timeline.is_overdue ? 'עבר הזמן ב-' : 'ימים נותרים'}
                  </span>
                  <span className="font-bold" style={{ color: summary.timeline.is_overdue ? 'var(--dash-negative)' : 'var(--color-primary)' }}>
                    {Math.abs(summary.timeline.days_remaining)} ימים
                  </span>
                </div>
              )}
              <div className="pt-3 border-t" style={{ borderColor: 'var(--dash-border)' }}>
                <div className="flex justify-between text-lg font-semibold">
                  <span style={{ color: 'var(--dash-text)' }}>סטטוס</span>
                  <span style={{
                    color: summary.timeline.is_completed ? 'var(--dash-positive)' :
                           summary.timeline.is_overdue ? 'var(--dash-negative)' :
                           'var(--color-primary)'
                  }}>
                    {summary.timeline.is_completed ? 'הושלם' :
                     summary.timeline.is_overdue ? 'באיחור' :
                     'פעיל'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-lg p-4 text-center text-sm" style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-3)' }}>
          סיכום נוצר ב: {format(new Date(summary.generated_at), 'dd/MM/yyyy HH:mm', { locale: he })}
        </div>
      </div>
    </div>
  );
}
