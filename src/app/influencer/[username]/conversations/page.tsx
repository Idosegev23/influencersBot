'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle,
  Search,
  Star,
  Clock,
  ChevronRight,
  User,
  Bot,
  Loader2,
  X,
  Flag,
  StarOff,
} from 'lucide-react';
import {
  getInfluencerByUsername,
  getChatSessionsWithMessages,
  searchChatSessions,
} from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';
import type { Influencer, ChatSession, ChatMessage } from '@/types';

type SessionWithMessages = ChatSession & { messages: ChatMessage[] };

export default function ConversationsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionWithMessages[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'starred'>('all');
  const [flaggedSessions, setFlaggedSessions] = useState<Set<string>>(new Set());
  const [starredSessions, setStarredSessions] = useState<Set<string>>(new Set());

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

        // Load sessions
        const sessionsData = await getChatSessionsWithMessages(inf.id, 50, 0);
        setSessions(sessionsData);

        // Load saved flags and stars from localStorage
        const savedFlags = localStorage.getItem(`flagged_${inf.id}`);
        const savedStars = localStorage.getItem(`starred_${inf.id}`);
        if (savedFlags) setFlaggedSessions(new Set(JSON.parse(savedFlags)));
        if (savedStars) setStarredSessions(new Set(JSON.parse(savedStars)));
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  // Search handler
  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (!influencer || !searchQuery.trim()) {
        if (influencer && !searchQuery.trim()) {
          const sessionsData = await getChatSessionsWithMessages(influencer.id, 50, 0);
          setSessions(sessionsData);
        }
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchChatSessions(influencer.id, searchQuery);
        setSessions(results);
      } catch (error) {
        console.error('Error searching:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(searchTimer);
  }, [searchQuery, influencer]);

  const toggleFlag = (sessionId: string) => {
    setFlaggedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      localStorage.setItem(`flagged_${influencer?.id}`, JSON.stringify([...newSet]));
      return newSet;
    });
  };

  const toggleStar = (sessionId: string) => {
    setStarredSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      localStorage.setItem(`starred_${influencer?.id}`, JSON.stringify([...newSet]));
      return newSet;
    });
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    if (filter === 'flagged') return flaggedSessions.has(session.id);
    if (filter === 'starred') return starredSessions.has(session.id);
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-slide-up">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
            <MessageCircle className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            היסטוריית שיחות
          </h1>
          <div className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
            {sessions.length} שיחות
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4 animate-slide-up">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--dash-text-3)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש בשיחות..."
              className="input w-full pr-12 pl-4 py-3"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300"
                style={{ color: 'var(--dash-text-3)' }}
              >
                <X className="w-5 h-5" />
              </button>
            )}
            {isSearching && (
              <Loader2 className="absolute left-12 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`pill transition-all duration-300 ${
                filter === 'all' ? 'pill-purple' : 'pill-neutral'
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setFilter('starred')}
              className={`pill transition-all duration-300 flex items-center gap-2 ${
                filter === 'starred' ? 'pill-amber' : 'pill-neutral'
              }`}
            >
              <Star className="w-4 h-4" />
              מסומנות בכוכב
            </button>
            <button
              onClick={() => setFilter('flagged')}
              className={`pill transition-all duration-300 flex items-center gap-2 ${
                filter === 'flagged' ? 'pill-red' : 'pill-neutral'
              }`}
            >
              <Flag className="w-4 h-4" />
              מסומנות לטיפול
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="space-y-4 animate-slide-up">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => {
              const isExpanded = expandedSession === session.id;
              const isFlagged = flaggedSessions.has(session.id);
              const isStarred = starredSessions.has(session.id);
              const firstUserMessage = session.messages.find(m => m.role === 'user');

              return (
                <div
                  key={session.id}
                  className="glass-card rounded-2xl overflow-hidden transition-all duration-300"
                  style={{
                    borderColor: isFlagged ? 'rgba(239,68,68,0.5)' : isStarred ? 'rgba(234,179,8,0.5)' : 'var(--dash-glass-border)',
                    borderWidth: '1px',
                  }}
                >
                  {/* Session Header */}
                  <div
                    className="p-4 cursor-pointer transition-all duration-300 hover:bg-[var(--dash-surface-hover)]"
                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300" style={{ background: 'var(--dash-surface)', border: '2px solid var(--dash-glass-border)' }}>
                          <User className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium" style={{ color: 'var(--dash-text)' }}>
                              {session.message_count} הודעות
                            </p>
                            {isStarred && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                            {isFlagged && <Flag className="w-4 h-4 text-red-400 fill-red-400" />}
                          </div>
                          <p className="text-sm flex items-center gap-1" style={{ color: 'var(--dash-text-2)' }}>
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(session.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Quick Actions */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(session.id);
                          }}
                          className={`p-2 rounded-2xl transition-all duration-300 ${
                            isStarred
                              ? 'text-yellow-400 bg-yellow-400/10'
                              : 'hover:bg-[var(--dash-surface-hover)]'
                          }`}
                          style={{ color: isStarred ? undefined : 'var(--dash-text-3)' }}
                        >
                          {isStarred ? <Star className="w-5 h-5 fill-current" /> : <StarOff className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFlag(session.id);
                          }}
                          className={`p-2 rounded-2xl transition-all duration-300 ${
                            isFlagged
                              ? 'text-red-400 bg-red-400/10'
                              : 'hover:bg-[var(--dash-surface-hover)]'
                          }`}
                          style={{ color: isFlagged ? undefined : 'var(--dash-text-3)' }}
                        >
                          <Flag className={`w-5 h-5 ${isFlagged ? 'fill-current' : ''}`} />
                        </button>

                        <div
                          className="transition-transform duration-300"
                          style={{
                            color: 'var(--dash-text-3)',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Preview of first message */}
                    {firstUserMessage && !isExpanded && (
                      <p className="mt-3 text-sm line-clamp-2 pr-16" style={{ color: 'var(--dash-text-2)' }}>
                        &quot;{firstUserMessage.content}&quot;
                      </p>
                    )}
                  </div>

                  {/* Expanded Messages */}
                  {isExpanded && (
                    <div>
                      <div className="p-4 space-y-3 max-h-96 overflow-y-auto" style={{ borderTop: `1px solid var(--dash-glass-border)` }}>
                        {session.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex gap-3 ${message.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                              style={{
                                background: message.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.2)',
                                border: `1px solid var(--dash-glass-border)`
                              }}
                            >
                              {message.role === 'user' ? (
                                <User className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Bot className="w-4 h-4 text-green-400" />
                              )}
                            </div>
                            <div
                              className={`max-w-[80%] p-3 rounded-2xl transition-all duration-300 ${
                                message.role === 'user'
                                  ? 'pill-purple'
                                  : ''
                              }`}
                              style={
                                message.role === 'user'
                                  ? {
                                      background: 'rgba(160, 148, 224, 0.15)',
                                      color: 'var(--dash-text)',
                                      borderBottomRightRadius: '4px',
                                      border: '1px solid rgba(160, 148, 224, 0.2)',
                                    }
                                  : {
                                      background: 'var(--dash-muted)',
                                      color: 'var(--dash-text)',
                                      border: `1px solid var(--dash-glass-border)`,
                                      borderBottomLeftRadius: '4px',
                                    }
                              }
                            >
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              <p className="text-xs opacity-50 mt-1">
                                {new Date(message.created_at).toLocaleTimeString('he-IL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 animate-slide-up">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all duration-300" style={{ background: 'var(--dash-surface)', border: `1px solid var(--dash-glass-border)` }}>
                <MessageCircle className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>
                {searchQuery ? 'לא נמצאו תוצאות' : 'אין שיחות עדיין'}
              </h3>
              <p style={{ color: 'var(--dash-text-2)' }}>
                {searchQuery
                  ? 'נסה לחפש מילים אחרות'
                  : 'שיחות חדשות יופיעו כאן כשהמבקרים ישתמשו בבוט'}
              </p>
            </div>
          )}
        </div>

        {/* Load More */}
        {sessions.length >= 50 && (
          <div className="mt-8 text-center animate-slide-up">
            <button
              onClick={async () => {
                if (!influencer) return;
                const more = await getChatSessionsWithMessages(influencer.id, 50, sessions.length);
                setSessions([...sessions, ...more]);
              }}
              className="glass-subtle px-6 py-3 rounded-2xl transition-all duration-300 hover:glass-card"
              style={{
                color: 'var(--dash-text)',
              }}
            >
              טען עוד שיחות
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
