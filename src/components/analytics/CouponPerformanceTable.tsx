'use client';

type CouponPerformance = {
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
};

type CouponPerformanceTableProps = {
  coupons: CouponPerformance[];
};

export default function CouponPerformanceTable({ coupons }: CouponPerformanceTableProps) {
  if (!coupons || coupons.length === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{
          background: 'var(--dash-surface)',
          border: '1px solid var(--dash-border)',
        }}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>ביצועי קופונים</h3>
        <p className="text-center py-8" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני קופונים</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: 'var(--dash-surface)',
        border: '1px solid var(--dash-border)',
      }}
    >
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>ביצועי קופונים מפורטים</h3>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--dash-border)' }}>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                מותג / קוד
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                העתקות
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                שימושים
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                המרה
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                סל ממוצע
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                הכנסות
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase" style={{ color: 'var(--dash-text-3)' }}>
                רווח/קופון
              </th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr
                key={coupon.coupon_id}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--dash-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    {coupon.brand_name && (
                      <span className="text-sm font-semibold mb-1" style={{ color: 'var(--dash-text)' }}>
                        {coupon.brand_name}
                      </span>
                    )}
                    {coupon.code ? (
                      <span className="font-mono font-bold text-xs" style={{ color: 'var(--color-primary)' }}>
                        {coupon.code}
                      </span>
                    ) : (
                      <span className="text-xs italic" style={{ color: 'var(--dash-text-3)' }}>
                        (קוד לא הוגדר)
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span style={{ color: 'var(--dash-text)' }}>
                    {coupon.copy_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium" style={{ color: 'var(--dash-text)' }}>
                    {coupon.usage_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium" style={{
                    color: coupon.conversion_rate >= 10 ? 'var(--dash-positive)' :
                      coupon.conversion_rate >= 5 ? 'var(--color-warning)' :
                      'var(--dash-negative)',
                  }}>
                    {coupon.conversion_rate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span style={{ color: 'var(--dash-text)' }}>
                    ₪{coupon.average_basket.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium" style={{ color: 'var(--dash-positive)' }}>
                    ₪{coupon.total_revenue.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-bold" style={{
                    color: coupon.profit_per_coupon > 0 ? 'var(--dash-positive)' : 'var(--dash-negative)',
                  }}>
                    ₪{coupon.profit_per_coupon.toFixed(0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4" style={{ borderTop: '1px solid var(--dash-border)' }}>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>
            {coupons.reduce((sum, c) => sum + c.copy_count, 0).toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>סה״כ העתקות</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>
            {coupons.reduce((sum, c) => sum + c.usage_count, 0).toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>סה״כ שימושים</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>
            ₪{coupons.reduce((sum, c) => sum + c.total_revenue, 0).toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>סה״כ הכנסות</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {(() => {
              const totalCopies = coupons.reduce((sum, c) => sum + c.copy_count, 0);
              const totalUsages = coupons.reduce((sum, c) => sum + c.usage_count, 0);
              return totalCopies > 0 ? ((totalUsages / totalCopies) * 100).toFixed(1) : '0';
            })()}%
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>המרה כללית</div>
        </div>
      </div>
    </div>
  );
}
