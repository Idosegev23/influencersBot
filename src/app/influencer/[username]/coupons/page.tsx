'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CouponPerformanceTable from '@/components/analytics/CouponPerformanceTable';
import TopProducts from '@/components/analytics/TopProducts';
import { Loader2 } from 'lucide-react';

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
    coupon_id: string;
    code: string;
    brand_name?: string;
    usage_count: number;
    copy_count: number;
    total_revenue: number;
    total_discount: number;
    profit_per_coupon: number;
    average_basket: number;
    conversion_rate: number;
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
    total_sold: number;
    total_revenue: number;
    average_price: number;
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load coupon analytics');
      }

      const apiResult: ApiCouponData = await response.json();

      // Debug: Check what API returns
      console.log('API Result:', apiResult);
      console.log('Brand Performance:', apiResult?.brandPerformance);
      if (apiResult?.brandPerformance?.[0]) {
        console.log('First Coupon:', apiResult.brandPerformance[0]);
      }

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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--dash-bg)' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)' }}>
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: 'var(--dash-surface)',
            border: '1px solid var(--dash-negative)',
          }}
        >
          <p style={{ color: 'var(--dash-negative)' }}>{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 rounded-lg text-white"
            style={{ background: 'var(--dash-negative)' }}
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
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>אנליטיקס קופונים</h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>ביצועי קופונים ומכירות</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'סה"כ קופונים', value: data?.overview?.total_coupons || 0, color: 'var(--dash-text)' },
            { label: 'הועתקו', value: data?.overview?.total_copied || 0, color: 'var(--color-info)' },
            { label: 'נוצלו', value: data?.overview?.total_used || 0, color: 'var(--dash-positive)' },
            { label: 'הכנסות', value: `₪${(data?.overview?.total_revenue || 0).toLocaleString('he-IL')}`, color: '#a855f7' },
            { label: 'אחוז המרה', value: `${(data?.overview?.avg_conversion_rate || 0).toFixed(1)}%`, color: 'var(--color-warning)' },
            { label: 'עוקבים / לא', value: `${data?.overview?.followers_vs_non?.followers || 0} / ${data?.overview?.followers_vs_non?.non_followers || 0}`, color: 'var(--dash-positive)' },
          ].map((card, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{
                background: 'var(--dash-surface)',
                border: '1px solid var(--dash-border)',
              }}
            >
              <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>{card.label}</div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Coupons Table */}
        {data?.coupons && data.coupons.length > 0 ? (
          <CouponPerformanceTable coupons={data.coupons} />
        ) : (
          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>ביצועי קופונים מפורטים</h3>
            <p className="text-center py-8" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני קופונים</p>
          </div>
        )}

        {/* Top Products */}
        {data?.top_products && data.top_products.length > 0 ? (
          <TopProducts products={data.top_products} />
        ) : (
          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>מוצרים פופולריים</h3>
            <p className="text-center py-8" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני מוצרים</p>
          </div>
        )}
      </div>
    </div>
  );
}
