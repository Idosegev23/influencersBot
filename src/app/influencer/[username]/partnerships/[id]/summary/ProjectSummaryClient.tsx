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
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">לא ניתן לטעון את הסיכום</p>
        <Link href={`/influencer/${username}/partnerships`} className="text-blue-600 hover:underline mt-4 inline-block">
          חזרה לשת״פים
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between print:mb-4">
          <div>
            <Link
              href={`/influencer/${username}/partnerships/${id}`}
              className="text-blue-600 hover:underline mb-2 inline-block print:hidden"
            >
              ← חזרה לשת״פ
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">סיכום פרויקט</h1>
            <p className="text-gray-600 mt-1">
              {summary.partnership.brand_name} - {summary.partnership.campaign_name}
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 print:hidden"
          >
            {isExporting ? 'מייצא...' : 'ייצא ל-PDF'}
          </button>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">תובנות ומסקנות</h2>
            <ul className="space-y-2">
              {insights.map((insight, idx) => (
                <li key={idx} className="text-blue-800">{insight}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Tasks Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">משימות</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">סה״כ</span>
                <span className="font-bold">{summary.tasks.total}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>הושלמו</span>
                <span className="font-bold">{summary.tasks.completed}</span>
              </div>
              <div className="flex justify-between text-blue-600">
                <span>בביצוע</span>
                <span className="font-bold">{summary.tasks.in_progress}</span>
              </div>
              <div className="flex justify-between text-yellow-600">
                <span>ממתינות</span>
                <span className="font-bold">{summary.tasks.pending}</span>
              </div>
              {summary.tasks.overdue > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>באיחור</span>
                  <span className="font-bold">{summary.tasks.overdue}</span>
                </div>
              )}
              <div className="pt-3 border-t">
                <div className="flex justify-between text-lg font-semibold">
                  <span>אחוז השלמה</span>
                  <span className="text-green-600">{summary.tasks.completion_rate}%</span>
                </div>
                <div className="mt-2 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${summary.tasks.completion_rate}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">השלמה בזמן</span>
                <span className="font-medium">{summary.tasks.on_time_completion_rate}%</span>
              </div>
            </div>
          </div>

          {/* ROI Summary */}
          {summary.roi && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">ROI וביצועים</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">השקעה</span>
                  <span className="font-bold">₪{summary.roi.investment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>הכנסות</span>
                  <span className="font-bold">₪{summary.roi.revenue.toLocaleString()}</span>
                </div>
                <div className="pt-3 border-t">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>ROI</span>
                    <span className={summary.roi.roi_percentage > 0 ? 'text-green-600' : 'text-red-600'}>
                      {summary.roi.roi_percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="pt-3 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">חשיפות</span>
                    <span>{summary.roi.total_impressions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">קליקים</span>
                    <span>{summary.roi.total_clicks.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">המרות</span>
                    <span>{summary.roi.total_conversions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-gray-600">שיעור המרה</span>
                    <span className="text-blue-600">{summary.roi.conversion_rate.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Coupons Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">קופונים</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">סה״כ קופונים</span>
                <span className="font-bold">{summary.coupons.total}</span>
              </div>
              <div className="flex justify-between text-blue-600">
                <span>שימושים</span>
                <span className="font-bold">{summary.coupons.total_usages}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>הכנסות מקופונים</span>
                <span className="font-bold">₪{summary.coupons.total_revenue.toLocaleString()}</span>
              </div>
              
              {summary.coupons.top_coupons.length > 0 && (
                <div className="pt-3 border-t">
                  <h3 className="text-sm font-semibold mb-2">קופונים מובילים</h3>
                  <div className="space-y-2">
                    {summary.coupons.top_coupons.map((coupon: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-600">{coupon.code}</span>
                        <div className="text-left">
                          <span className="font-medium">{coupon.usage_count} שימושים</span>
                          <span className="text-gray-500 mx-2">•</span>
                          <span className="text-green-600">₪{coupon.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">ציר זמן</h2>
            <div className="space-y-3">
              {summary.partnership.start_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">תאריך התחלה</span>
                  <span className="font-medium">
                    {format(new Date(summary.partnership.start_date), 'dd/MM/yyyy', { locale: he })}
                  </span>
                </div>
              )}
              {summary.partnership.end_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">תאריך סיום</span>
                  <span className="font-medium">
                    {format(new Date(summary.partnership.end_date), 'dd/MM/yyyy', { locale: he })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">משך הפרויקט</span>
                <span className="font-bold">{summary.timeline.duration_days} ימים</span>
              </div>
              {summary.timeline.days_remaining !== null && (
                <div className={`flex justify-between ${summary.timeline.is_overdue ? 'text-red-600' : 'text-blue-600'}`}>
                  <span>{summary.timeline.is_overdue ? 'עבר הזמן ב-' : 'ימים נותרים'}</span>
                  <span className="font-bold">{Math.abs(summary.timeline.days_remaining)} ימים</span>
                </div>
              )}
              <div className="pt-3 border-t">
                <div className="flex justify-between text-lg font-semibold">
                  <span>סטטוס</span>
                  <span className={
                    summary.timeline.is_completed ? 'text-green-600' : 
                    summary.timeline.is_overdue ? 'text-red-600' : 
                    'text-blue-600'
                  }>
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
        <div className="bg-gray-100 rounded-lg p-4 text-center text-sm text-gray-600">
          סיכום נוצר ב: {format(new Date(summary.generated_at), 'dd/MM/yyyy HH:mm', { locale: he })}
        </div>
      </div>
    </div>
  );
}
