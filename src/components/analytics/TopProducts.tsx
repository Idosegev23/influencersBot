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
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">המוצרים הנמכרים ביותר</h3>
        <p className="text-gray-500 text-center py-8">אין עדיין נתוני מכירות</p>
      </div>
    );
  }

  const maxSold = Math.max(...products.map(p => p.total_sold));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">המוצרים הנמכרים ביותר</h3>
      
      <div className="space-y-4">
        {products.map((product, index) => {
          const percentage = (product.total_sold / maxSold) * 100;
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="font-medium text-gray-900">
                    {product.product_name}
                  </span>
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">
                    {product.total_sold} יח׳
                  </div>
                  <div className="text-xs text-gray-500">
                    ₪{product.total_revenue.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 right-0 h-full bg-gradient-to-l from-blue-500 to-blue-400 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between text-xs text-gray-500">
                <span>מחיר ממוצע: ₪{product.average_price.toFixed(2)}</span>
                <span>{percentage.toFixed(0)}% מהסך</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">סה״כ מוצרים שונים:</span>
          <span className="font-bold">{products.length}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-600">סה״כ יחידות שנמכרו:</span>
          <span className="font-bold">
            {products.reduce((sum, p) => sum + p.total_sold, 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-600">סה״כ הכנסות:</span>
          <span className="font-bold text-green-600">
            ₪{products.reduce((sum, p) => sum + p.total_revenue, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
