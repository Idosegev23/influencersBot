'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Communication = {
  id: string;
  subject: string;
  category: 'financial' | 'legal' | 'issues' | 'general';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'waiting_response' | 'waiting_payment' | 'resolved' | 'closed';
  brand_name: string;
  last_message_at: string;
  last_message_by: string;
  unread_count: number;
  message_count: number;
  due_date?: string;
};

type CommunicationsListProps = {
  username?: string;
  accountId?: string;
  category?: string;
  status?: string;
  communications?: Communication[]; // Optional - if provided, use instead of fetching
};

export default function CommunicationsList({
  username,
  accountId,
  category,
  status,
  communications: providedCommunications,
}: CommunicationsListProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // If communications are provided as props, use them directly
  useEffect(() => {
    if (providedCommunications) {
      setCommunications(providedCommunications);
      setLoading(false);
      return;
    }

    // Otherwise, fetch them
    if (username) {
      fetchCommunications();
    }
  }, [username, accountId, category, status, providedCommunications]);

  const fetchCommunications = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (status) params.set('status', status);

      const queryString = params.toString();
      const url = queryString 
        ? `/api/influencer/communications?${queryString}`
        : `/api/influencer/communications`;
        
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch communications');
      }

      const data = await res.json();
      setCommunications(data.communications || []);
    } catch (err: any) {
      console.error('Error fetching communications:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'financial': return '💰';
      case 'legal': return '⚖️';
      case 'issues': return '🚨';
      default: return '💬';
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'financial': return 'bg-green-100 text-green-800';
      case 'legal': return 'bg-blue-100 text-blue-800';
      case 'issues': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'open': return { text: 'פתוח', color: 'bg-blue-100 text-blue-800' };
      case 'waiting_response': return { text: 'ממתין לתגובה', color: 'bg-yellow-100 text-yellow-800' };
      case 'waiting_payment': return { text: 'ממתין לתשלום', color: 'bg-orange-100 text-orange-800' };
      case 'resolved': return { text: 'נפתר', color: 'bg-green-100 text-green-800' };
      case 'closed': return { text: 'נסגר', color: 'bg-gray-100 text-gray-800' };
      default: return { text: st, color: 'bg-gray-100 text-gray-800' };
    }
  };

  const getPriorityBadge = (pri: string) => {
    switch (pri) {
      case 'urgent': return { text: 'דחוף!', color: 'bg-red-600 text-white' };
      case 'high': return { text: 'גבוה', color: 'bg-red-100 text-red-800' };
      case 'normal': return null;
      case 'low': return { text: 'נמוך', color: 'bg-gray-100 text-gray-600' };
      default: return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דקות`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    
    return date.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען שיחות...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">שגיאה בטעינת שיחות: {error}</p>
        <button
          onClick={fetchCommunications}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  if (communications.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">💬</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">אין שיחות עדיין</h3>
        <p className="text-gray-600">התחל שיחה חדשה עם מותג</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {communications.map((comm) => {
        const statusBadge = getStatusBadge(comm.status);
        const priorityBadge = getPriorityBadge(comm.priority);
        const overdue = isOverdue(comm.due_date);

        return (
          <Link
            key={comm.id}
            href={`/influencer/${username}/communications/${comm.id}`}
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className="flex items-start justify-between">
              {/* Right side - Content */}
              <div className="flex-1 min-w-0">
                {/* Title + Badges */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{getCategoryIcon(comm.category)}</span>
                  <h3 className="text-base font-semibold text-gray-900 truncate">{comm.subject}</h3>
                  {comm.unread_count > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {comm.unread_count}
                    </span>
                  )}
                </div>

                {/* Brand + Status */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm text-gray-600">{comm.brand_name}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusBadge.color}`}>
                    {statusBadge.text}
                  </span>
                  {priorityBadge && (
                    <span className={`text-xs px-2 py-1 rounded-full ${priorityBadge.color}`}>
                      {priorityBadge.text}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(comm.category)}`}>
                    {comm.category}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{comm.message_count} הודעות</span>
                  <span>•</span>
                  <span>עדכון אחרון: {formatDate(comm.last_message_at)}</span>
                  {comm.due_date && (
                    <>
                      <span>•</span>
                      <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                        {overdue ? '⚠️ באיחור!' : `תאריך יעד: ${new Date(comm.due_date).toLocaleDateString('he-IL')}`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Left side - Arrow */}
              <div className="mr-4">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
