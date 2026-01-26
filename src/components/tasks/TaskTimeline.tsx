'use client';

import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addDays } from 'date-fns';
import { he } from 'date-fns/locale';

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  partnership?: {
    brand_name: string;
  };
};

type TaskTimelineProps = {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
};

export default function TaskTimeline({ tasks, onTaskClick }: TaskTimelineProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
  const weekEnd = endOfWeek(today, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    
    tasks.forEach(task => {
      if (!task.due_date) return;
      
      const taskDate = new Date(task.due_date);
      const dateKey = format(taskDate, 'yyyy-MM-dd');
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(task);
    });

    return grouped;
  }, [tasks]);

  const getTaskColor = (task: Task) => {
    if (task.status === 'completed') return 'bg-green-100 border-green-500 text-green-800';
    if (task.status === 'blocked') return 'bg-gray-100 border-gray-400 text-gray-600';
    
    switch (task.priority) {
      case 'urgent':
        return 'bg-red-100 border-red-500 text-red-800';
      case 'high':
        return 'bg-orange-100 border-orange-500 text-orange-800';
      case 'medium':
        return 'bg-blue-100 border-blue-500 text-blue-800';
      case 'low':
        return 'bg-gray-100 border-gray-400 text-gray-600';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '⟳';
      case 'blocked':
        return '⚠';
      case 'cancelled':
        return '✕';
      default:
        return '○';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">לו״ז משימות - השבוע</h3>
      
      <div className="grid grid-cols-7 gap-2">
        {daysInWeek.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDate[dateKey] || [];
          const isToday = isSameDay(day, today);

          return (
            <div
              key={dateKey}
              className={`min-h-[150px] p-3 rounded-lg border-2 ${
                isToday
                  ? 'bg-blue-50 border-blue-400'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="text-center mb-2">
                <div className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                  {format(day, 'EEE', { locale: he })}
                </div>
                <div className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                  {format(day, 'd')}
                </div>
                {dayTasks.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    {dayTasks.length} {dayTasks.length === 1 ? 'משימה' : 'משימות'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {dayTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick?.(task)}
                    className={`w-full text-right p-2 rounded border-r-4 text-xs ${getTaskColor(task)} hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start gap-1">
                      <span className="text-xs">{getStatusIcon(task.status)}</span>
                      <div className="flex-1">
                        <div className="font-medium line-clamp-2">
                          {task.title}
                        </div>
                        {task.partnership && (
                          <div className="text-xs opacity-75 mt-1">
                            {task.partnership.brand_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-100 border-2 border-red-500 rounded"></div>
          <span>דחוף</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-100 border-2 border-orange-500 rounded"></div>
          <span>גבוהה</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-100 border-2 border-blue-500 rounded"></div>
          <span>בינונית</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-100 border-2 border-green-500 rounded"></div>
          <span>הושלם</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-100 border-2 border-gray-400 rounded"></div>
          <span>חסום</span>
        </div>
      </div>
    </div>
  );
}
