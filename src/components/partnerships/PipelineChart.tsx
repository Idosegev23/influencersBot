'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PipelineData {
  status: string;
  count: number;
  total_value: number;
  percentage: number;
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  negotiation: 'משא ומתן',
  active: 'פעיל',
  in_progress: 'בעבודה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

const STATUS_COLORS: Record<string, string> = {
  lead: '#94a3b8',
  negotiation: '#f59e0b',
  active: '#3b82f6',
  in_progress: '#10b981',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

export function PipelineChart({ data }: { data: PipelineData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        <p>אין נתונים על שת"פים</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
        Pipeline - שת"פים לפי סטטוס
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
          <YAxis
            type="category"
            dataKey="status"
            tickFormatter={(value) => STATUS_LABELS[value] || value}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            width={100}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              value.toLocaleString('he-IL'),
              name === 'count' ? 'כמות' : 'ערך כולל',
            ]}
            labelFormatter={(label) => STATUS_LABELS[label] || label}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              direction: 'rtl',
            }}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={STATUS_COLORS[entry.status] || '#6b7280'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
        {data.map((item) => (
          <div
            key={item.status}
            className="p-3 border border-gray-200 rounded-lg"
            style={{
              borderRightColor: STATUS_COLORS[item.status] || '#6b7280',
              borderRightWidth: '4px',
            }}
          >
            <div className="text-xs text-gray-600 mb-1 text-right">
              {STATUS_LABELS[item.status] || item.status}
            </div>
            <div className="text-lg font-semibold text-gray-900">{item.count}</div>
            <div className="text-xs text-gray-500 mt-1">
              ₪{item.total_value.toLocaleString('he-IL')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
