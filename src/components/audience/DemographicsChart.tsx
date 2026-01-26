'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface DemographicsProps {
  ageGroups: Array<{ range: string; percentage: number }>;
  gender: Array<{ gender: string; percentage: number }>;
  locations: Array<{ country: string; percentage: number }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function DemographicsChart({ ageGroups, gender, locations }: DemographicsProps) {
  const renderCustomLabel = (entry: any) => {
    return `${entry.percentage}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Age Groups */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4 text-right">קבוצות גיל</h4>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={ageGroups}
              dataKey="percentage"
              nameKey="range"
              cx="50%"
              cy="50%"
              outerRadius={60}
              label={renderCustomLabel}
            >
              {ageGroups.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value}%`}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                direction: 'rtl',
              }}
            />
            <Legend
              wrapperStyle={{ direction: 'rtl', fontSize: '12px' }}
              iconSize={10}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Gender */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4 text-right">מגדר</h4>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={gender}
              dataKey="percentage"
              nameKey="gender"
              cx="50%"
              cy="50%"
              outerRadius={60}
              label={renderCustomLabel}
            >
              {gender.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value}%`}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                direction: 'rtl',
              }}
            />
            <Legend
              wrapperStyle={{ direction: 'rtl', fontSize: '12px' }}
              iconSize={10}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Locations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4 text-right">מיקום גיאוגרפי</h4>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={locations}
              dataKey="percentage"
              nameKey="country"
              cx="50%"
              cy="50%"
              outerRadius={60}
              label={renderCustomLabel}
            >
              {locations.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value}%`}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                direction: 'rtl',
              }}
            />
            <Legend
              wrapperStyle={{ direction: 'rtl', fontSize: '12px' }}
              iconSize={10}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
