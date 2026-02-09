'use client';

import { use, useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ManagementStats {
  totalMessages: number;
  todayMessages: number;
  activeCoupons: number;
  activeBrands: number;
}

export default function ManagePage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<ManagementStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [code]);

  async function checkAuth() {
    try {
      // For now, simple check - code should be "123456"
      if (code === '123456') {
        setAuthorized(true);
        loadStats();
      } else {
        setAuthorized(false);
        setLoading(false);
      }
    } catch (error) {
      setAuthorized(false);
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      // TODO: Call API to get real stats
      setStats({
        totalMessages: 0,
        todayMessages: 0,
        activeCoupons: 4,
        activeBrands: 3,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">טוען...</div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">גישה נדחתה</h1>
          <p className="text-gray-300">קוד הניהול שהזנת אינו תקין</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-indigo-400" />
          <h1 className="text-3xl font-bold text-white">לוח ניהול - מירן בוזגלו</h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <div className="text-gray-300 text-sm mb-2">סה"כ הודעות</div>
            <div className="text-3xl font-bold text-white">{stats?.totalMessages || 0}</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <div className="text-gray-300 text-sm mb-2">הודעות היום</div>
            <div className="text-3xl font-bold text-indigo-400">{stats?.todayMessages || 0}</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <div className="text-gray-300 text-sm mb-2">קופונים פעילים</div>
            <div className="text-3xl font-bold text-green-400">{stats?.activeCoupons || 0}</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <div className="text-gray-300 text-sm mb-2">מותגים פעילים</div>
            <div className="text-3xl font-bold text-purple-400">{stats?.activeBrands || 0}</div>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bot Status */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              סטטוס הבוט
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">צ'אטבוט</span>
                <span className="text-green-400 text-sm font-medium">✓ פעיל</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">פרסונה</span>
                <span className="text-green-400 text-sm font-medium">✓ מעודכנת</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">תמלולים</span>
                <span className="text-green-400 text-sm font-medium">✓ 356 תמלולים</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">פעולות מהירות</h2>
            <div className="space-y-3">
              <a
                href="/chat/miranbuzaglo"
                className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-3 text-center transition-colors"
              >
                צפייה בצ'אט
              </a>
              <a
                href={`/api/persona/rebuild?accountId=4e2a0ce8-8753-4876-973c-00c9e1426e51`}
                className="block w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-3 text-center transition-colors"
                onClick={(e) => {
                  if (!confirm('לבנות מחדש את הפרסונה? (לוקח כ-2 דקות)')) {
                    e.preventDefault();
                  }
                }}
              >
                בניית פרסונה מחדש
              </a>
              <button
                className="w-full bg-gray-600 hover:bg-gray-700 text-white rounded-lg px-4 py-3 text-center transition-colors"
                disabled
              >
                הגדרות (בקרוב)
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-200 text-sm text-center">
            💡 דף ניהול בסיסי - פיצ'רים נוספים יתווספו בקרוב
          </p>
        </div>
      </div>
    </div>
  );
}
