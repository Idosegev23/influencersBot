'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SubTasksList from '@/components/tasks/SubTasksList';

interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  due_date: string | null;
  partnership_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  in_progress: 'בתהליך',
  blocked: 'חסום',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  urgent: 'דחוף',
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Task>>({});

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/tasks/${taskId}?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load task');
      }

      const result = await response.json();
      setTask(result.task);
      setEditData(result.task);
    } catch (err) {
      console.error('Error loading task:', err);
      setError('שגיאה בטעינת המשימה');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/influencer/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...editData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      const result = await response.json();
      setTask(result.task);
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating task:', err);
      setError('שגיאה בעדכון המשימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/influencer/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      const result = await response.json();
      setTask(result.task);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('שגיאה בעדכון הסטטוס');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error && !task) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            חזור
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  const isDueToday =
    task.due_date &&
    new Date(task.due_date).toDateString() === new Date().toDateString();
  const isOverdue =
    task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.push(`/influencer/${username}/tasks`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור למשימות</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{task.title}</h1>
            {task.description && (
              <p className="text-gray-600 mt-2">{task.description}</p>
            )}
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ערוך
            </button>
          )}
        </div>

        {/* Status Badges */}
        <div className="flex gap-2 mt-4">
          <span
            className={`text-xs px-2 py-1 rounded font-medium ${
              task.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : task.status === 'in_progress'
                ? 'bg-blue-100 text-blue-700'
                : task.status === 'blocked'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {STATUS_LABELS[task.status] || task.status}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded font-medium ${
              task.priority === 'urgent'
                ? 'bg-red-100 text-red-700'
                : task.priority === 'high'
                ? 'bg-orange-100 text-orange-700'
                : task.priority === 'medium'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
          {task.due_date && (
            <span
              className={`text-xs px-2 py-1 rounded font-medium ${
                isOverdue
                  ? 'bg-red-100 text-red-700'
                  : isDueToday
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {isOverdue ? '🔴 באיחור' : isDueToday ? '⚠️ היום' : '📅 '}
              {new Date(task.due_date).toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {/* Quick Status Actions */}
      {!isEditing && task.status !== 'completed' && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 mb-3 font-medium">פעולות מהירות:</p>
          <div className="flex gap-2">
            {task.status === 'pending' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                התחל משימה
              </button>
            )}
            {task.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                סמן כהושלם
              </button>
            )}
            <button
              onClick={() => handleStatusChange('blocked')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              סמן כחסום
            </button>
          </div>
        </div>
      )}

      {/* Task Details */}
      {isEditing ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              כותרת
            </label>
            <input
              type="text"
              value={editData.title || task.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תיאור
            </label>
            <textarea
              value={editData.description ?? task.description ?? ''}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                סטטוס
              </label>
              <select
                value={editData.status || task.status}
                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
              >
                <option value="pending">ממתין</option>
                <option value="in_progress">בתהליך</option>
                <option value="blocked">חסום</option>
                <option value="completed">הושלם</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                עדיפות
              </label>
              <select
                value={editData.priority || task.priority}
                onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
              >
                <option value="low">נמוכה</option>
                <option value="medium">בינונית</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחוף</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך יעד
            </label>
            <input
              type="date"
              value={editData.due_date ?? task.due_date ?? ''}
              onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditData(task);
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Task Info Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-1">סוג משימה</p>
                <p className="text-gray-900 font-medium">{task.type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">תאריך יצירה</p>
                <p className="text-gray-900">
                  {new Date(task.created_at).toLocaleDateString('he-IL')}
                </p>
              </div>
              {task.completed_at && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">תאריך השלמה</p>
                  <p className="text-gray-900">
                    {new Date(task.completed_at).toLocaleDateString('he-IL')}
                  </p>
                </div>
              )}
            </div>

            {task.partnership_id && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-2">שייך לשת"פ:</p>
                <button
                  onClick={() =>
                    router.push(
                      `/influencer/${username}/partnerships/${task.partnership_id}`
                    )
                  }
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  צפה בשת"פ →
                </button>
              </div>
            )}
          </div>

          {/* Sub-tasks (if any) */}
          <SubTasksList taskId={taskId} username={username} />
        </div>
      )}
    </div>
  );
}
