'use client';

import { useEffect, useState } from 'react';

interface ROIData {
  total_investment: number;
  total_revenue: number;
  coupon_revenue: number;
  roi_percentage: number;
  total_conversions: number;
  calculated_metrics: {
    profit: number;
    roi_multiple: number;
    conversion_rate: number;
    cost_per_conversion: number;
  };
  status: {
    label: string;
    color: string;
  };
}

export function ROIDashboard({ partnershipId }: { partnershipId: string }) {
  const [data, setData] = useState<ROIData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadROIData();
  }, [partnershipId]);

  const loadROIData = async () => {
    try {
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}/roi`
      );
      if (response.ok) {
        const result = await response.json();
        setData(result.roi);
      }
    } catch (error) {
      console.error('Error loading ROI:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 h-64 rounded-lg" />;
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        <p>אין נתוני ROI זמינים</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main ROI Card */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-8 text-white">
        <div className="text-sm opacity-90 mb-2">ROI - Return on Investment</div>
        <div className="text-5xl font-bold mb-2">
          {data.roi_percentage.toFixed(1)}%
        </div>
        <div className={`text-lg ${data.status.color} bg-white/20 rounded px-3 py-1 inline-block`}>
          {data.status.label}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">השקעה</div>
          <div className="text-2xl font-bold text-gray-900">
            ₪{data.total_investment.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">הכנסות</div>
          <div className="text-2xl font-bold text-green-600">
            ₪{data.total_revenue.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">רווח</div>
          <div className={`text-2xl font-bold ${
            data.calculated_metrics.profit >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            ₪{data.calculated_metrics.profit.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">המרות</div>
          <div className="text-2xl font-bold text-purple-600">
            {data.total_conversions}
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
          מדדים נוספים
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-600 mb-1">ROI Multiple</div>
            <div className="text-lg font-semibold">
              {data.calculated_metrics.roi_multiple}x
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-600 mb-1">שיעור המרה</div>
            <div className="text-lg font-semibold">
              {data.calculated_metrics.conversion_rate.toFixed(2)}%
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-600 mb-1">עלות להמרה</div>
            <div className="text-lg font-semibold">
              ₪{data.calculated_metrics.cost_per_conversion.toFixed(0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
