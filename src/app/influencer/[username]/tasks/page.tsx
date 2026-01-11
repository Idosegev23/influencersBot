'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  Filter,
  Search,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Clock,
  Briefcase,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  due_date?: string;
  partnership?: {
    id: string;
    brand_name: string;
    status: string;
  };
  created_at: string;
}

export default function TasksPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load tasks
        const tasksRes = await fetch(`/api/influencer/tasks?username=${username}&limit=100`);
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          setTasks(data.tasks || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      low: { label: 'נמוך', className: 'bg-gray-500/20 text-gray-300' },
      medium: { label: 'בינוני', className: 'bg-blue-500/20 text-blue-400' },
      high: { label: 'גבוה', className: 'bg-orange-500/20 text-orange-400' },
      urgent: { label: 'דחוף', className: 'bg-red-500/20 text-red-400' },
    };

    const badge = badges[priority] || badges.medium;
    return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${badge.className}`}>{badge.label}</span>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-400" />;
      case 'blocked':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const isOverdue = (due_date?: string) => {
    if (!due_date) return false;
    return new Date(due_date) < new Date();
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && isOverdue(t.due_date)).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/influencer/${username}/dashboard`} className="text-gray-400 hover:text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 text-orange-400" />
                  משימות
                </h1>
                <p className="text-sm text-gray-400">ניהול משימות ופרויקטים</p>
              </div>
            </div>

            <Link
              href={`/influencer/${username}/tasks/new`}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              משימה חדשה
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-sm text-gray-400">סה"כ משימות</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-500/20 flex items-center justify-center">
                <Circle className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.pending}</p>
                <p className="text-sm text-gray-400">ממתינות</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.inProgress}</p>
                <p className="text-sm text-gray-400">בביצוע</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.completed}</p>
                <p className="text-sm text-gray-400">הושלמו</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.overdue}</p>
                <p className="text-sm text-gray-400">באיחור</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6 flex flex-col sm:flex-row gap-4"
        >
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש משימה..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="pending">ממתינה</option>
              <option value="in_progress">בביצוע</option>
              <option value="completed">הושלם</option>
              <option value="blocked">חסומה</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="all">כל העדיפויות</option>
              <option value="urgent">דחוף</option>
              <option value="high">גבוה</option>
              <option value="medium">בינוני</option>
              <option value="low">נמוך</option>
            </select>
          </div>
        </motion.div>

        {/* Tasks List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task, index) => (
              <Link
                key={task.id}
                href={`/influencer/${username}/tasks/${task.id}`}
                className="block"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.03 }}
                  className={`bg-gray-800/50 backdrop-blur border rounded-2xl p-4 transition-all hover:bg-gray-800/70 ${
                    task.status !== 'completed' && isOverdue(task.due_date)
                      ? 'border-red-500/50 hover:border-red-500'
                      : 'border-gray-700 hover:border-orange-500/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 pt-0.5">
                      {getStatusIcon(task.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className={`font-semibold ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-white'}`}>
                          {task.title}
                        </h3>
                        {getPriorityBadge(task.priority)}
                      </div>

                      {task.description && (
                        <p className="text-sm text-gray-400 line-clamp-1 mb-2">{task.description}</p>
                      )}

                      <div className="flex flex-wrap gap-3 text-sm">
                        {task.due_date && (
                          <span className={`flex items-center gap-1 ${
                            task.status !== 'completed' && isOverdue(task.due_date)
                              ? 'text-red-400'
                              : 'text-gray-400'
                          }`}>
                            <Clock className="w-4 h-4" />
                            {new Date(task.due_date).toLocaleDateString('he-IL')}
                          </span>
                        )}

                        {task.partnership && (
                          <span className="flex items-center gap-1 text-purple-400">
                            <Briefcase className="w-4 h-4" />
                            {task.partnership.brand_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))
          ) : (
            <div className="text-center py-16">
              <CheckCircle2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all' ? 'לא נמצאו משימות' : 'אין עדיין משימות'}
              </h3>
              <p className="text-gray-400 mb-6">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'נסו לשנות את הפילטרים או החיפוש'
                  : 'התחילו לנהל את המשימות שלכם'}
              </p>
              {!searchQuery && statusFilter === 'all' && priorityFilter === 'all' && (
                <Link
                  href={`/influencer/${username}/tasks/new`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors font-medium"
                >
                  <Plus className="w-5 h-5" />
                  צור משימה ראשונה
                </Link>
              )}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

