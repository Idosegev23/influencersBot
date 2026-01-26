'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MonthlyRevenue {
  month: string;
  revenue: number;
  count: number;
}

export function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        <p>אין נתונים על הכנסות</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return `₪${(value / 1000).toFixed(0)}K`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
        הכנסות חודשיות
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="month"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            orientation="right"
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === 'revenue'
                ? `₪${value.toLocaleString('he-IL')}`
                : value,
              name === 'revenue' ? 'הכנסות' : 'כמות שת"פים',
            ]}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              direction: 'rtl',
            }}
          />
          <Legend
            formatter={(value) =>
              value === 'revenue' ? 'הכנסות' : 'כמות שת"פים'
            }
            wrapperStyle={{ direction: 'rtl', paddingTop: '20px' }}
          />
          <Bar dataKey="revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          <Bar dataKey="count" fill="#10b981" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
