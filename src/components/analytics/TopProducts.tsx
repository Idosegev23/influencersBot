'use client';

type Product = {
  product_name: string;
  total_sold: number;
  total_revenue: number;
  average_price: number;
};

type TopProductsProps = {
  products: Product[];
};

export default function TopProducts({ products }: TopProductsProps) {
  if (!products || products.length === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{
          background: 'var(--dash-surface)',
          border: '1px solid var(--dash-border)',
        }}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>המוצרים הנמכרים ביותר</h3>
        <p className="text-center py-8" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני מכירות</p>
      </div>
    );
  }

  const maxSold = Math.max(...products.map(p => p.total_sold));

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: 'var(--dash-surface)',
        border: '1px solid var(--dash-border)',
      }}
    >
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>המוצרים הנמכרים ביותר</h3>

      <div className="space-y-4">
        {products.map((product, index) => {
          const percentage = (product.total_sold / maxSold) * 100;

          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                    style={{
                      background: 'var(--dash-bar)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--dash-text)' }}>
                    {product.product_name}
                  </span>
                </div>
                <div className="text-left">
                  <div className="font-bold" style={{ color: 'var(--dash-text)' }}>
                    {product.total_sold} יח׳
                  </div>
                  <div className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                    ₪{product.total_revenue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--dash-bar)' }}>
                <div
                  className="absolute top-0 right-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    background: 'var(--color-primary)',
                  }}
                ></div>
              </div>

              <div className="flex justify-between text-xs" style={{ color: 'var(--dash-text-3)' }}>
                <span>מחיר ממוצע: ₪{product.average_price.toFixed(2)}</span>
                <span>{percentage.toFixed(0)}% מהסך</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--dash-border)' }}>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--dash-text-2)' }}>סה״כ מוצרים שונים:</span>
          <span className="font-bold" style={{ color: 'var(--dash-text)' }}>{products.length}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span style={{ color: 'var(--dash-text-2)' }}>סה״כ יחידות שנמכרו:</span>
          <span className="font-bold" style={{ color: 'var(--dash-text)' }}>
            {products.reduce((sum, p) => sum + p.total_sold, 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span style={{ color: 'var(--dash-text-2)' }}>סה״כ הכנסות:</span>
          <span className="font-bold" style={{ color: 'var(--dash-positive)' }}>
            ₪{products.reduce((sum, p) => sum + p.total_revenue, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
