'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto p-4">
        {/* Page Title + Refresh */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>פניות תמיכה</h1>
            <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
              {requests.filter(r => r.status === 'new').length} פניות חדשות
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

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
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2"
              style={{
                background: filter === tab.key ? 'var(--color-primary)' : 'var(--dash-surface)',
                color: filter === tab.key ? 'white' : 'var(--dash-text-2)',
              }}
            >
              {tab.label}
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{
                  background: filter === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--dash-surface-hover)',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3)' }} />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text-2)' }}>אין פניות</h2>
            <p style={{ color: 'var(--dash-text-3)' }}>
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
                  <div
                    key={request.id}
                    className="p-4 rounded-xl cursor-pointer transition-all border"
                    style={{
                      borderColor: selectedRequest?.id === request.id ? 'var(--color-primary)' : 'var(--dash-border)',
                      background: selectedRequest?.id === request.id ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                    }}
                    onClick={() => setSelectedRequest(request)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" style={{ color: 'var(--dash-text-2)' }} />
                        <span className="font-medium" style={{ color: 'var(--dash-text)' }}>{request.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusConfig[request.status].color}`} />
                        <span className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                          {statusConfig[request.status].label}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--dash-text-2)' }}>{request.message}</p>

                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--dash-text-3)' }}>
                      <span>{formatDate(request.created_at)}</span>
                      {request.customer_phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span dir="ltr">{request.customer_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Request Detail */}
            {selectedRequest ? (
              <div
                key={selectedRequest.id}
                className="sticky top-24 p-6 rounded-xl border"
                style={{ borderColor: 'var(--dash-border)' }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>פרטי הפנייה</h3>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    style={{ color: 'var(--dash-text-2)' }}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Customer Info */}
                  <div className="p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                    <div className="flex items-center gap-3 mb-2">
                      <User className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                      <span className="font-medium" style={{ color: 'var(--dash-text)' }}>{selectedRequest.customer_name}</span>
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
                    <div className="p-4 rounded-xl" style={{ background: 'var(--dash-surface)' }}>
                      <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>
                        <Package className="w-4 h-4" />
                        <span>מוצר קשור</span>
                      </div>
                      <p className="font-medium" style={{ color: 'var(--dash-text)' }}>{selectedRequest.products.name}</p>
                      {selectedRequest.products.coupon_code && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">
                          {selectedRequest.products.coupon_code}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message */}
                  <div>
                    <p className="text-sm mb-2" style={{ color: 'var(--dash-text-2)' }}>הודעה:</p>
                    <p className="whitespace-pre-wrap p-4 rounded-xl" style={{ background: 'var(--dash-surface)', color: 'var(--dash-text)' }}>
                      {selectedRequest.message}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--dash-text-3)' }}>
                    <Clock className="w-4 h-4" />
                    <span>{new Date(selectedRequest.created_at).toLocaleString('he-IL')}</span>
                  </div>

                  {/* Status Actions */}
                  <div className="pt-4" style={{ borderTop: '1px solid var(--dash-border)' }}>
                    <p className="text-sm mb-3" style={{ color: 'var(--dash-text-2)' }}>שנה סטטוס:</p>
                    <div className="flex flex-wrap gap-2">
                      {(['new', 'in_progress', 'resolved', 'closed'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(selectedRequest.id, status)}
                          disabled={updating || selectedRequest.status === status}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                            selectedRequest.status === status
                              ? `${statusConfig[status].color} text-white`
                              : ''
                          }`}
                          style={selectedRequest.status !== status ? {
                            background: 'var(--dash-surface)',
                            color: 'var(--dash-text-2)',
                          } : undefined}
                        >
                          {statusConfig[status].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="hidden md:flex items-center justify-center p-12 rounded-xl border"
                style={{ borderColor: 'var(--dash-border)' }}
              >
                <p style={{ color: 'var(--dash-text-3)' }}>בחר פנייה לצפייה בפרטים</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
