'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CouponPerformanceTable from '@/components/analytics/CouponPerformanceTable';
import TopProducts from '@/components/analytics/TopProducts';

interface CouponData {
  coupons: Array<{
    id: string;
    code: string;
    partnership: {
      id: string;
      brand_name: string;
    };
    times_copied: number;
    times_used: number;
    conversion_rate: number;
    total_revenue: number;
    avg_order_value: number;
    created_at: string;
  }>;
  overview: {
    total_coupons: number;
    total_copied: number;
    total_used: number;
    total_revenue: number;
    avg_conversion_rate: number;
    followers_vs_non: {
      followers: number;
      non_followers: number;
    };
  };
  top_products: Array<{
    product_name: string;
    times_ordered: number;
    revenue: number;
  }>;
}

export default function CouponsAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [data, setData] = useState<CouponData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnershipFilter, setPartnershipFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/analytics/coupons?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load coupon analytics');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error loading coupon analytics:', err);
      setError('שגיאה בטעינת נתוני קופונים');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">אנליטיקס קופונים</h1>
        <p className="text-gray-600 mt-2">ביצועי קופונים ומכירות</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סה"כ קופונים</div>
          <div className="text-2xl font-bold text-gray-900">
            {data.overview.total_coupons}
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הועתקו</div>
          <div className="text-2xl font-bold text-blue-600">
            {data.overview.total_copied}
          </div>
        </div>

        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">נוצלו</div>
          <div className="text-2xl font-bold text-green-600">
            {data.overview.total_used}
          </div>
        </div>

        <div className="bg-white border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הכנסות</div>
          <div className="text-2xl font-bold text-purple-600">
            ₪{data.overview.total_revenue.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">אחוז המרה</div>
          <div className="text-2xl font-bold text-orange-600">
            {data.overview.avg_conversion_rate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">עוקבים / לא</div>
          <div className="text-lg font-bold text-emerald-600">
            {data.overview.followers_vs_non.followers} /{' '}
            {data.overview.followers_vs_non.non_followers}
          </div>
        </div>
      </div>

      {/* Coupons Table */}
      <CouponPerformanceTable coupons={data.coupons} />

      {/* Top Products */}
      <TopProducts products={data.top_products} />
    </div>
  );
}
