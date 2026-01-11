'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Plus,
  Filter,
  Search,
  ChevronLeft,
  Loader2,
  DollarSign,
  Calendar,
  FileText,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';
import type { Influencer } from '@/types';

interface Partnership {
  id: string;
  brand_name: string;
  brand_contact_name?: string;
  brand_contact_email?: string;
  status: string;
  proposal_amount?: number;
  contract_amount?: number;
  currency: string;
  start_date?: string;
  end_date?: string;
  brief?: string;
  created_at: string;
}

export default function PartnershipsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
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

        // Load partnerships
        const partnershipsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
        if (partnershipsRes.ok) {
          const data = await partnershipsRes.json();
          setPartnerships(data.partnerships || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      lead: { label: 'ליד', className: 'bg-gray-500/20 text-gray-300' },
      proposal: { label: 'הצעה', className: 'bg-blue-500/20 text-blue-400' },
      negotiation: { label: 'משא ומתן', className: 'bg-yellow-500/20 text-yellow-400' },
      contract: { label: 'חוזה', className: 'bg-purple-500/20 text-purple-400' },
      active: { label: 'פעיל', className: 'bg-green-500/20 text-green-400' },
      completed: { label: 'הושלם', className: 'bg-emerald-500/20 text-emerald-400' },
      cancelled: { label: 'בוטל', className: 'bg-red-500/20 text-red-400' },
    };

    const badge = badges[status] || badges.lead;
    return <span className={`px-3 py-1 rounded-lg text-sm font-medium ${badge.className}`}>{badge.label}</span>;
  };

  const filteredPartnerships = partnerships.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchQuery && !p.brand_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: partnerships.length,
    active: partnerships.filter(p => p.status === 'active').length,
    proposal: partnerships.filter(p => p.status === 'proposal').length,
    totalValue: partnerships.reduce((sum, p) => sum + (p.contract_amount || 0), 0),
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
                  <Briefcase className="w-7 h-7 text-purple-400" />
                  שת"פים
                </h1>
                <p className="text-sm text-gray-400">ניהול שותפויות עם מותגים</p>
              </div>
            </div>

            <Link
              href={`/influencer/${username}/partnerships/new`}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              שת"פ חדש
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-sm text-gray-400">סה"כ שת"פים</p>
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
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.active}</p>
                <p className="text-sm text-gray-400">פעילים</p>
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
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.proposal}</p>
                <p className="text-sm text-gray-400">הצעות</p>
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
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">₪{formatNumber(stats.totalValue)}</p>
                <p className="text-sm text-gray-400">ערך כולל</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 flex flex-col sm:flex-row gap-4"
        >
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש שת"פ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="lead">ליד</option>
              <option value="proposal">הצעה</option>
              <option value="negotiation">משא ומתן</option>
              <option value="contract">חוזה</option>
              <option value="active">פעיל</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
        </motion.div>

        {/* Partnerships List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-4"
        >
          {filteredPartnerships.length > 0 ? (
            filteredPartnerships.map((partnership, index) => (
              <Link
                key={partnership.id}
                href={`/influencer/${username}/partnerships/${partnership.id}`}
                className="block"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + index * 0.05 }}
                  className="bg-gray-800/50 backdrop-blur border border-gray-700 hover:border-purple-500/50 rounded-2xl p-6 transition-all hover:bg-gray-800/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-6 h-6 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-white mb-1">{partnership.brand_name}</h3>
                          {partnership.brand_contact_name && (
                            <p className="text-sm text-gray-400">{partnership.brand_contact_name}</p>
                          )}
                        </div>
                      </div>

                      {partnership.brief && (
                        <p className="text-sm text-gray-400 line-clamp-2 mb-3">{partnership.brief}</p>
                      )}

                      <div className="flex flex-wrap gap-3 text-sm">
                        {partnership.start_date && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <Calendar className="w-4 h-4" />
                            {new Date(partnership.start_date).toLocaleDateString('he-IL')}
                          </div>
                        )}
                        {partnership.contract_amount && (
                          <div className="flex items-center gap-1 text-green-400 font-semibold">
                            <DollarSign className="w-4 h-4" />
                            ₪{formatNumber(partnership.contract_amount)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(partnership.status)}
                      <p className="text-xs text-gray-500">
                        {new Date(partnership.created_at).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))
          ) : (
            <div className="text-center py-16">
              <Briefcase className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {searchQuery || statusFilter !== 'all' ? 'לא נמצאו שת"פים' : 'אין עדיין שת"פים'}
              </h3>
              <p className="text-gray-400 mb-6">
                {searchQuery || statusFilter !== 'all' 
                  ? 'נסו לשנות את הפילטרים או החיפוש'
                  : 'התחילו לנהל את השותפויות שלכם עם מותגים'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <Link
                  href={`/influencer/${username}/partnerships/new`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium"
                >
                  <Plus className="w-5 h-5" />
                  צור שת"פ ראשון
                </Link>
              )}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

