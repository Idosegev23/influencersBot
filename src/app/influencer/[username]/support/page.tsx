'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  User,
  Phone,
  Package,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

interface SupportRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  message: string;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  products?: {
    name: string;
    coupon_code: string | null;
    brand: string | null;
  } | null;
}

const statusConfig = {
  new: { label: 'חדש', color: 'bg-blue-500', icon: MessageSquare },
  in_progress: { label: 'בטיפול', color: 'bg-yellow-500', icon: Clock },
  resolved: { label: 'טופל', color: 'bg-green-500', icon: CheckCircle },
  closed: { label: 'סגור', color: 'bg-gray-500', icon: XCircle },
};

export default function SupportPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all');
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
  const [updating, setUpdating] = useState(false);

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
        await fetchRequests();
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const fetchRequests = async () => {
    try {
      const res = await fetch(`/api/support?username=${username}`);
      const data = await res.json();
      if (data.requests) {
        setRequests(data.requests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const handleStatusChange = async (requestId: string, newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status: newStatus }),
      });

      if (res.ok) {
        await fetchRequests();
        if (selectedRequest?.id === requestId) {
          setSelectedRequest(prev => prev ? { ...prev, status: newStatus as SupportRequest['status'] } : null);
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const filteredRequests = requests.filter(r => 
    filter === 'all' || r.status === filter
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'עכשיו';
    if (hours < 24) return `לפני ${hours} שעות`;
    if (days < 7) return `לפני ${days} ימים`;
    return date.toLocaleDateString('he-IL');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold">פניות תמיכה</h1>
                <p className="text-sm text-gray-400">
                  {requests.filter(r => r.status === 'new').length} פניות חדשות
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { key: 'all', label: 'הכל', count: requests.length },
            { key: 'new', label: 'חדשות', count: requests.filter(r => r.status === 'new').length },
            { key: 'in_progress', label: 'בטיפול', count: requests.filter(r => r.status === 'in_progress').length },
            { key: 'resolved', label: 'טופלו', count: requests.filter(r => r.status === 'resolved' || r.status === 'closed').length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                filter === tab.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                filter === tab.key ? 'bg-purple-500' : 'bg-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-400 mb-2">אין פניות</h2>
            <p className="text-gray-500">
              {filter === 'all' ? 'עדיין לא התקבלו פניות תמיכה' : 'אין פניות בסטטוס זה'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Requests List */}
            <div className="space-y-3">
              {filteredRequests.map((request) => {
                const StatusIcon = statusConfig[request.status].icon;
                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 bg-gray-800/50 border rounded-xl cursor-pointer transition-all ${
                      selectedRequest?.id === request.id
                        ? 'border-purple-500 bg-purple-900/20'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedRequest(request)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{request.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusConfig[request.status].color}`} />
                        <span className="text-xs text-gray-400">
                          {statusConfig[request.status].label}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-300 line-clamp-2 mb-3">{request.message}</p>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatDate(request.created_at)}</span>
                      {request.customer_phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span dir="ltr">{request.customer_phone}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Request Detail */}
            <AnimatePresence mode="wait">
              {selectedRequest ? (
                <motion.div
                  key={selectedRequest.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="sticky top-24 p-6 bg-gray-800/50 border border-gray-700 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">פרטי הפנייה</h3>
                    <button
                      onClick={() => setSelectedRequest(null)}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Customer Info */}
                    <div className="p-4 bg-gray-700/30 rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <User className="w-5 h-5 text-purple-400" />
                        <span className="font-medium">{selectedRequest.customer_name}</span>
                      </div>
                      {selectedRequest.customer_phone && (
                        <a
                          href={`https://wa.me/${selectedRequest.customer_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm"
                        >
                          <Phone className="w-4 h-4" />
                          <span dir="ltr">{selectedRequest.customer_phone}</span>
                          <span className="text-xs">(פתח ב-WhatsApp)</span>
                        </a>
                      )}
                    </div>

                    {/* Product Info */}
                    {selectedRequest.products && (
                      <div className="p-4 bg-gray-700/30 rounded-xl">
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                          <Package className="w-4 h-4" />
                          <span>מוצר קשור</span>
                        </div>
                        <p className="font-medium">{selectedRequest.products.name}</p>
                        {selectedRequest.products.coupon_code && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">
                            {selectedRequest.products.coupon_code}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Message */}
                    <div>
                      <p className="text-sm text-gray-400 mb-2">הודעה:</p>
                      <p className="text-gray-200 whitespace-pre-wrap bg-gray-700/30 p-4 rounded-xl">
                        {selectedRequest.message}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(selectedRequest.created_at).toLocaleString('he-IL')}</span>
                    </div>

                    {/* Status Actions */}
                    <div className="pt-4 border-t border-gray-700">
                      <p className="text-sm text-gray-400 mb-3">שנה סטטוס:</p>
                      <div className="flex flex-wrap gap-2">
                        {(['new', 'in_progress', 'resolved', 'closed'] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(selectedRequest.id, status)}
                            disabled={updating || selectedRequest.status === status}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                              selectedRequest.status === status
                                ? `${statusConfig[status].color} text-white`
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {statusConfig[status].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="hidden md:flex items-center justify-center p-12 bg-gray-800/30 border border-gray-700 rounded-xl">
                  <p className="text-gray-500">בחר פנייה לצפייה בפרטים</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

