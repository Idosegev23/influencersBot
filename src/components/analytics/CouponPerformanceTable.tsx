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
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">ביצועי קופונים</h3>
        <p className="text-gray-500 text-center py-8">אין עדיין נתוני קופונים</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">ביצועי קופונים מפורטים</h3>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                מותג / קוד
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                העתקות
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                שימושים
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                המרה
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                סל ממוצע
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                הכנסות
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                רווח/קופון
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {coupons.map((coupon) => (
              <tr key={coupon.coupon_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    {coupon.brand_name && (
                      <span className="text-sm font-semibold text-gray-900 mb-1">
                        {coupon.brand_name}
                      </span>
                    )}
                    <span className="font-mono font-bold text-blue-600 text-xs">
                      {coupon.code}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="text-gray-900">
                    {coupon.copy_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium text-gray-900">
                    {coupon.usage_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={`font-medium ${
                    coupon.conversion_rate >= 10 ? 'text-green-600' :
                    coupon.conversion_rate >= 5 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {coupon.conversion_rate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="text-gray-900">
                    ₪{coupon.average_basket.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="font-medium text-green-600">
                    ₪{coupon.total_revenue.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={`font-bold ${
                    coupon.profit_per_coupon > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₪{coupon.profit_per_coupon.toFixed(0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {coupons.reduce((sum, c) => sum + c.copy_count, 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-600 mt-1">סה״כ העתקות</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {coupons.reduce((sum, c) => sum + c.usage_count, 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-600 mt-1">סה״כ שימושים</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            ₪{coupons.reduce((sum, c) => sum + c.total_revenue, 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-600 mt-1">סה״כ הכנסות</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {(() => {
              const totalCopies = coupons.reduce((sum, c) => sum + c.copy_count, 0);
              const totalUsages = coupons.reduce((sum, c) => sum + c.usage_count, 0);
              return totalCopies > 0 ? ((totalUsages / totalCopies) * 100).toFixed(1) : '0';
            })()}%
          </div>
          <div className="text-xs text-gray-600 mt-1">המרה כללית</div>
        </div>
      </div>
    </div>
  );
}
