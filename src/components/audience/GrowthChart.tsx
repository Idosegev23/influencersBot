'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface GrowthData {
  date: string;
  followers: number;
  growth: number;
}

export function GrowthChart({ data }: { data: GrowthData[] }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('he-IL');
  };

  return (
    <div className="w-full h-80 bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">גרף צמיחה</h3>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            tickFormatter={formatNumber}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            orientation="right"
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatNumber(value),
              name === 'followers' ? 'עוקבים' : 'צמיחה',
            ]}
            labelFormatter={formatDate}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
              direction: 'rtl',
            }}
          />
          <Legend
            formatter={(value: string) => (value === 'followers' ? 'עוקבים' : 'צמיחה יומית')}
            wrapperStyle={{ direction: 'rtl', paddingTop: '20px' }}
          />
          <Line
            type="monotone"
            dataKey="followers"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="growth"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 3 }}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
