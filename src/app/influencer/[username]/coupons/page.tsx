'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CouponPerformanceTable from '@/components/analytics/CouponPerformanceTable';
import TopProducts from '@/components/analytics/TopProducts';

// API response format
interface ApiCouponData {
  totals: {
    totalCopies: number;
    totalUniqueCopiers: number;
    totalBrands: number;
    activeBrands: number;
    totalLinkClicks: number;
  };
  brandPerformance: Array<{
    brandId: string;
    brandName: string;
    couponCode: string;
    category: string;
    copyCount: number;
    uniqueUsers: number;
    link: string;
    shortLink: string;
    linkClicks: number;
    clickThroughRate: number;
  }>;
  topCoupons: Array<{
    brandId: string;
    brandName: string;
    couponCode: string;
    copyCount: number;
    uniqueUsers: number;
    linkClicks: number;
    clickThroughRate: number;
  }>;
}

// Frontend display format
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

      const apiResult: ApiCouponData = await response.json();
      
      // Transform API format to frontend format with null safety
      const transformedData: CouponData = {
        overview: {
          total_coupons: apiResult?.totals?.totalBrands || 0,
          total_copied: apiResult?.totals?.totalCopies || 0,
          total_used: 0, // Not available from current API
          total_revenue: 0, // Not available from current API
          avg_conversion_rate: (apiResult?.totals?.totalCopies || 0) > 0 
            ? ((apiResult?.totals?.totalLinkClicks || 0) / (apiResult?.totals?.totalCopies || 1)) * 100 
            : 0,
          followers_vs_non: {
            followers: 0, // Not available from current API
            non_followers: apiResult?.totals?.totalUniqueCopiers || 0,
          },
        },
        coupons: (apiResult?.brandPerformance || []).map(brand => ({
          coupon_id: brand?.brandId || '',
          code: brand?.couponCode || '',
          brand_name: brand?.brandName || '',
          copy_count: brand?.copyCount || 0,
          usage_count: brand?.linkClicks || 0,
          conversion_rate: brand?.clickThroughRate || 0,
          total_revenue: 0, // Not available
          total_discount: 0, // Not available
          profit_per_coupon: 0, // Not available
          average_basket: 0, // Not available
        })),
        top_products: (apiResult?.topCoupons || []).slice(0, 10).map(coupon => ({
          product_name: coupon?.brandName || 'Unknown',
          total_sold: coupon?.copyCount || 0,
          total_revenue: 0, // Not available
          average_price: 0, // Not available
        })),
      };
      
      setData(transformedData);
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
            {data?.overview?.total_coupons || 0}
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הועתקו</div>
          <div className="text-2xl font-bold text-blue-600">
            {data?.overview?.total_copied || 0}
          </div>
        </div>

        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">נוצלו</div>
          <div className="text-2xl font-bold text-green-600">
            {data?.overview?.total_used || 0}
          </div>
        </div>

        <div className="bg-white border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הכנסות</div>
          <div className="text-2xl font-bold text-purple-600">
            ₪{(data?.overview?.total_revenue || 0).toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">אחוז המרה</div>
          <div className="text-2xl font-bold text-orange-600">
            {(data?.overview?.avg_conversion_rate || 0).toFixed(1)}%
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">עוקבים / לא</div>
          <div className="text-lg font-bold text-emerald-600">
            {data?.overview?.followers_vs_non?.followers || 0} /{' '}
            {data?.overview?.followers_vs_non?.non_followers || 0}
          </div>
        </div>
      </div>

      {/* Coupons Table */}
      <CouponPerformanceTable coupons={data?.coupons || []} />

      {/* Top Products */}
      <TopProducts products={data?.top_products || []} />
    </div>
  );
}
