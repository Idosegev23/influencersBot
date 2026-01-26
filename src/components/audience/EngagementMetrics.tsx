'use client';

interface EngagementMetricsProps {
  likesRate: number;
  commentsRate: number;
  sharesRate: number;
  savesRate: number;
  reach: number;
  impressions: number;
}

export function EngagementMetrics({
  likesRate,
  commentsRate,
  sharesRate,
  savesRate,
  reach,
  impressions,
}: EngagementMetricsProps) {
  const metrics = [
    {
      label: 'אחוז לייקים',
      value: `${likesRate.toFixed(2)}%`,
      icon: '❤️',
      color: 'bg-red-50 text-red-700',
    },
    {
      label: 'אחוז תגובות',
      value: `${commentsRate.toFixed(2)}%`,
      icon: '💬',
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'אחוז שיתופים',
      value: `${sharesRate.toFixed(2)}%`,
      icon: '🔄',
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'אחוז שמירות',
      value: `${savesRate.toFixed(2)}%`,
      icon: '🔖',
      color: 'bg-purple-50 text-purple-700',
    },
    {
      label: 'טווח הגעה',
      value: reach.toLocaleString('he-IL'),
      icon: '👥',
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'חשיפות',
      value: impressions.toLocaleString('he-IL'),
      icon: '👁️',
      color: 'bg-indigo-50 text-indigo-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric, index) => (
        <div
          key={index}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">{metric.icon}</span>
            <div
              className={`px-2 py-1 rounded text-xs font-medium ${metric.color}`}
            >
              {metric.value}
            </div>
          </div>
          <div className="text-sm text-gray-600 text-right">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}
