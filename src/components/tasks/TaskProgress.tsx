'use client';

type TaskProgressProps = {
  tasks: {
    status: string;
  }[];
};

export default function TaskProgress({ tasks }: TaskProgressProps) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;

  const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const inProgressPercent = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0;
  const blockedPercent = total > 0 ? Math.round((blocked / total) * 100) : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">התקדמות משימות</h3>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>סה״כ התקדמות</span>
          <span className="font-bold text-gray-900">{completedPercent}%</span>
        </div>
        <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute top-0 right-0 h-full bg-gradient-to-l from-green-500 to-green-400 transition-all duration-500"
            style={{ width: `${completedPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{completed}</div>
          <div className="text-xs text-green-700 mt-1">הושלמו</div>
          <div className="text-xs text-gray-500 mt-1">{completedPercent}%</div>
        </div>

        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{inProgress}</div>
          <div className="text-xs text-blue-700 mt-1">בביצוע</div>
          <div className="text-xs text-gray-500 mt-1">{inProgressPercent}%</div>
        </div>

        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">{pending}</div>
          <div className="text-xs text-yellow-700 mt-1">ממתינות</div>
          <div className="text-xs text-gray-500 mt-1">{pendingPercent}%</div>
        </div>

        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{blocked}</div>
          <div className="text-xs text-red-700 mt-1">חסומות</div>
          <div className="text-xs text-gray-500 mt-1">{blockedPercent}%</div>
        </div>
      </div>

      {/* Total */}
      <div className="mt-4 pt-4 border-t text-center">
        <div className="text-sm text-gray-600">
          סה״כ משימות: <span className="font-bold text-gray-900">{total}</span>
        </div>
      </div>
    </div>
  );
}
