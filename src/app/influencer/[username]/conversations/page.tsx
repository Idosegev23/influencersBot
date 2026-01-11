'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  ArrowLeft,
  Search,
  Star,
  Clock,
  ChevronRight,
  ChevronDown,
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
  supabase,
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">חזרה</span>
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-blue-400" />
                היסטוריית שיחות
              </h1>
            </div>

            <div className="text-sm text-gray-400">
              {sessions.length} שיחות
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 space-y-4"
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש בשיחות..."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pr-12 pl-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            {isSearching && (
              <Loader2 className="absolute left-12 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400 animate-spin" />
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setFilter('starred')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                filter === 'starred'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Star className="w-4 h-4" />
              מסומנות בכוכב
            </button>
            <button
              onClick={() => setFilter('flagged')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                filter === 'flagged'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Flag className="w-4 h-4" />
              מסומנות לטיפול
            </button>
          </div>
        </motion.div>

        {/* Sessions List */}
        <div className="space-y-4">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session, index) => {
              const isExpanded = expandedSession === session.id;
              const isFlagged = flaggedSessions.has(session.id);
              const isStarred = starredSessions.has(session.id);
              const firstUserMessage = session.messages.find(m => m.role === 'user');

              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-gray-800/50 backdrop-blur border rounded-2xl overflow-hidden transition-all ${
                    isFlagged ? 'border-red-500/50' : isStarred ? 'border-yellow-500/50' : 'border-gray-700'
                  }`}
                >
                  {/* Session Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-700/30 transition-colors"
                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white">
                              {session.message_count} הודעות
                            </p>
                            {isStarred && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                            {isFlagged && <Flag className="w-4 h-4 text-red-400 fill-red-400" />}
                          </div>
                          <p className="text-sm text-gray-400 flex items-center gap-1">
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
                          className={`p-2 rounded-lg transition-colors ${
                            isStarred
                              ? 'text-yellow-400 bg-yellow-400/10'
                              : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-700'
                          }`}
                        >
                          {isStarred ? <Star className="w-5 h-5 fill-current" /> : <StarOff className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFlag(session.id);
                          }}
                          className={`p-2 rounded-lg transition-colors ${
                            isFlagged
                              ? 'text-red-400 bg-red-400/10'
                              : 'text-gray-500 hover:text-red-400 hover:bg-gray-700'
                          }`}
                        >
                          <Flag className={`w-5 h-5 ${isFlagged ? 'fill-current' : ''}`} />
                        </button>

                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          className="text-gray-400"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Preview of first message */}
                    {firstUserMessage && !isExpanded && (
                      <p className="mt-3 text-sm text-gray-400 line-clamp-2 pr-16">
                        &quot;{firstUserMessage.content}&quot;
                      </p>
                    )}
                  </div>

                  {/* Expanded Messages */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-gray-700 p-4 space-y-3 max-h-96 overflow-y-auto">
                          {session.messages.map((message) => (
                            <div
                              key={message.id}
                              className={`flex gap-3 ${message.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}
                            >
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  message.role === 'user'
                                    ? 'bg-indigo-500/20'
                                    : 'bg-green-500/20'
                                }`}
                              >
                                {message.role === 'user' ? (
                                  <User className="w-4 h-4 text-indigo-400" />
                                ) : (
                                  <Bot className="w-4 h-4 text-green-400" />
                                )}
                              </div>
                              <div
                                className={`max-w-[80%] p-3 rounded-2xl ${
                                  message.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                                }`}
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <MessageCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {searchQuery ? 'לא נמצאו תוצאות' : 'אין שיחות עדיין'}
              </h3>
              <p className="text-gray-400">
                {searchQuery
                  ? 'נסה לחפש מילים אחרות'
                  : 'שיחות חדשות יופיעו כאן כשהמבקרים ישתמשו בבוט'}
              </p>
            </motion.div>
          )}
        </div>

        {/* Load More */}
        {sessions.length >= 50 && (
          <div className="mt-8 text-center">
            <button
              onClick={async () => {
                if (!influencer) return;
                const more = await getChatSessionsWithMessages(influencer.id, 50, sessions.length);
                setSessions([...sessions, ...more]);
              }}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
            >
              טען עוד שיחות
            </button>
          </div>
        )}
      </main>
    </div>
  );
}








