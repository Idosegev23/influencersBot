'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SubTasksList from '@/components/tasks/SubTasksList';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

type Task = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  completed_at: string | null;
  checklist: any[];
  attachments: any[];
  partnership: {
    id: string;
    brand_name: string;
    status: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export default function TaskDetailsClient({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTask();
  }, [username, id]);

  const fetchTask = async () => {
    try {
      const res = await fetch(`/api/influencer/tasks/${id}?username=${username}`);
      if (!res.ok) throw new Error('Failed to fetch task');
      const data = await res.json();
      setTask(data.task);
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/influencer/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        }),
      });

      if (!res.ok) throw new Error('Failed to update task');
      const data = await res.json();
      setTask(data.task);
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('שגיאה בעדכון המשימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChecklistUpdate = async (newChecklist: any[]) => {
    if (!task) return;

    const res = await fetch(`/api/influencer/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        checklist: newChecklist,
      }),
    });

    if (!res.ok) throw new Error('Failed to update checklist');
    const data = await res.json();
    setTask(data.task);
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את המשימה?')) return;

    try {
      const res = await fetch(`/api/influencer/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) throw new Error('Failed to delete task');
      router.push(`/influencer/${username}/tasks`);
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('שגיאה במחיקת המשימה');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'blocked':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'ממתינה',
      in_progress: 'בביצוע',
      completed: 'הושלמה',
      cancelled: 'בוטלה',
      blocked: 'חסומה',
    };
    return labels[status] || status;
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      low: 'נמוכה',
      medium: 'בינונית',
      high: 'גבוהה',
      urgent: 'דחוף',
    };
    return labels[priority] || priority;
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-600">
          <p>המשימה לא נמצאה</p>
          <Link
            href={`/influencer/${username}/tasks`}
            className="text-blue-600 hover:underline mt-4 inline-block"
          >
            חזרה לרשימת משימות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/influencer/${username}/tasks`}
            className="text-blue-600 hover:underline mb-4 inline-block"
          >
            ← חזרה לרשימת משימות
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{task.title}</h1>
              {task.partnership && (
                <div className="text-sm text-gray-600">
                  שת״פ: <span className="font-medium">{task.partnership.brand_name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                מחק
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-3">תיאור</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {task.description || 'אין תיאור'}
              </p>
            </div>

            {/* Sub-tasks */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-3">תתי-משימות</h2>
              <SubTasksList
                taskId={task.id}
                checklist={task.checklist}
                onUpdate={handleChecklistUpdate}
              />
            </div>

            {/* Time Tracking */}
            {(task.estimated_hours || task.actual_hours) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-3">מעקב זמנים</h2>
                <div className="grid grid-cols-2 gap-4">
                  {task.estimated_hours && (
                    <div>
                      <div className="text-sm text-gray-600">זמן משוער</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {task.estimated_hours} שעות
                      </div>
                    </div>
                  )}
                  {task.actual_hours && (
                    <div>
                      <div className="text-sm text-gray-600">זמן בפועל</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {task.actual_hours} שעות
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">סטטוס</h3>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isSaving}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="pending">ממתינה</option>
                <option value="in_progress">בביצוע</option>
                <option value="completed">הושלמה</option>
                <option value="blocked">חסומה</option>
                <option value="cancelled">בוטלה</option>
              </select>
            </div>

            {/* Metadata */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">עדיפות</div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(task.priority)}`}>
                  {getPriorityLabel(task.priority)}
                </span>
              </div>

              {task.due_date && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">תאריך יעד</div>
                  <div className="font-medium">
                    {format(new Date(task.due_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                  </div>
                </div>
              )}

              {task.assignee && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">אחראי</div>
                  <div className="font-medium">{task.assignee}</div>
                </div>
              )}

              <div>
                <div className="text-sm text-gray-600 mb-1">נוצר ב</div>
                <div className="text-sm">
                  {format(new Date(task.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                </div>
              </div>

              {task.completed_at && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">הושלם ב</div>
                  <div className="text-sm">
                    {format(new Date(task.completed_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
