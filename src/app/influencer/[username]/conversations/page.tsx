'use client';

import { useState, useEffect, use, useCallback } from 'react';
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
  Globe,
  Instagram,
  MessageSquare,
  Filter,
} from 'lucide-react';
import {
  getInfluencerByUsername,
} from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';
import type { Influencer, ChatSession, ChatMessage } from '@/types';

type Channel = 'all' | 'chat' | 'dm' | 'widget';

type SessionWithMessages = ChatSession & {
  messages: ChatMessage[];
  channel: Channel;
};

function detectChannel(threadId: string | null): 'chat' | 'dm' | 'widget' {
  if (!threadId) return 'chat';
  if (threadId.startsWith('dm_')) return 'dm';
  if (threadId.startsWith('widget_')) return 'widget';
  return 'chat';
}

const CHANNEL_CONFIG: Record<'chat' | 'dm' | 'widget', { label: string; icon: typeof MessageCircle; color: string; bg: string }> = {
  chat: { label: 'צ׳אט', icon: MessageSquare, color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
  dm: { label: 'DM', icon: Instagram, color: '#e879a8', bg: 'rgba(232,121,168,0.15)' },
  widget: { label: 'וידג׳ט', icon: Globe, color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
};

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
  const [channelFilter, setChannelFilter] = useState<Channel>('all');
  const [flaggedSessions, setFlaggedSessions] = useState<Set<string>>(new Set());
  const [starredSessions, setStarredSessions] = useState<Set<string>>(new Set());

  const loadSessions = useCallback(async (accountId: string, offset = 0) => {
    const { data: rawSessions, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + 49);

    if (error || !rawSessions) return [];

    // Batch-fetch last 2 messages per session for preview
    const sessionsWithMessages: SessionWithMessages[] = await Promise.all(
      rawSessions.map(async (s) => {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('id, session_id, role, content, created_at')
          .eq('session_id', s.id)
          .order('created_at', { ascending: true })
          .limit(50);

        return {
          ...s,
          messages: msgs || [],
          channel: detectChannel(s.thread_id),
        };
      })
    );

    return sessionsWithMessages;
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        const data = await loadSessions(inf.id);
        setSessions(data);

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
  }, [username, router, loadSessions]);

  // Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!influencer) return;

      if (!searchQuery.trim()) {
        const data = await loadSessions(influencer.id);
        setSessions(data);
        return;
      }

      setIsSearching(true);
      try {
        // Search in messages
        const { data: matchingMsgs } = await supabase
          .from('chat_messages')
          .select('session_id')
          .ilike('content', `%${searchQuery}%`)
          .limit(100);

        if (!matchingMsgs || matchingMsgs.length === 0) {
          setSessions([]);
          return;
        }

        const sessionIds = [...new Set(matchingMsgs.map(m => m.session_id))];

        const { data: rawSessions } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('account_id', influencer.id)
          .in('id', sessionIds)
          .order('created_at', { ascending: false });

        if (!rawSessions) {
          setSessions([]);
          return;
        }

        const results: SessionWithMessages[] = await Promise.all(
          rawSessions.map(async (s) => {
            const { data: msgs } = await supabase
              .from('chat_messages')
              .select('id, session_id, role, content, created_at')
              .eq('session_id', s.id)
              .order('created_at', { ascending: true })
              .limit(50);

            return {
              ...s,
              messages: msgs || [],
              channel: detectChannel(s.thread_id),
            };
          })
        );

        setSessions(results);
      } catch (error) {
        console.error('Error searching:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, influencer, loadSessions]);

  const toggleFlag = (sessionId: string) => {
    setFlaggedSessions(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      localStorage.setItem(`flagged_${influencer?.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleStar = (sessionId: string) => {
    setStarredSessions(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      localStorage.setItem(`starred_${influencer?.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  // Filter
  const filteredSessions = sessions.filter(s => {
    if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
    return true;
  });

  // Channel counts
  const channelCounts = sessions.reduce((acc, s) => {
    acc[s.channel] = (acc[s.channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
            <MessageCircle className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            שיחות
          </h1>
          <div className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
            {sessions.length} שיחות
          </div>
        </div>

        {/* Channel Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setChannelFilter('all')}
            className={`pill transition-all duration-200 ${channelFilter === 'all' ? 'pill-purple' : 'pill-neutral'}`}
          >
            <Filter className="w-3.5 h-3.5 ml-1" />
            הכל ({sessions.length})
          </button>
          {(['chat', 'dm', 'widget'] as const).map(ch => {
            const cfg = CHANNEL_CONFIG[ch];
            const count = channelCounts[ch] || 0;
            if (count === 0) return null;
            const Icon = cfg.icon;
            const isActive = channelFilter === ch;
            return (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className="pill transition-all duration-200"
                style={{
                  background: isActive ? cfg.bg : 'var(--dash-surface)',
                  color: isActive ? cfg.color : 'var(--dash-text-2)',
                  border: `1px solid ${isActive ? cfg.color + '40' : 'var(--dash-glass-border)'}`,
                }}
              >
                <Icon className="w-3.5 h-3.5 ml-1" />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="mb-6 relative">
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
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--dash-text-3)' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="absolute left-12 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
          )}
        </div>

        {/* Sessions List */}
        <div className="space-y-3">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => {
              const isExpanded = expandedSession === session.id;
              const isFlagged = flaggedSessions.has(session.id);
              const isStarred = starredSessions.has(session.id);
              const firstUserMessage = session.messages.find(m => m.role === 'user');
              const channelCfg = CHANNEL_CONFIG[session.channel];
              const ChannelIcon = channelCfg.icon;

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
                      <div className="flex items-center gap-3">
                        {/* Channel icon */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: channelCfg.bg, border: `1px solid ${channelCfg.color}30` }}
                        >
                          <ChannelIcon className="w-5 h-5" style={{ color: channelCfg.color }} />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            {/* Channel badge */}
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: channelCfg.bg, color: channelCfg.color }}
                            >
                              {channelCfg.label}
                            </span>
                            <span className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                              {session.message_count} הודעות
                            </span>
                            {isStarred && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                            {isFlagged && <Flag className="w-3.5 h-3.5 text-red-400 fill-red-400" />}
                          </div>
                          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--dash-text-3)' }}>
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(session.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStar(session.id); }}
                          className={`p-1.5 rounded-xl transition-all duration-200 ${isStarred ? 'text-yellow-400 bg-yellow-400/10' : 'hover:bg-[var(--dash-surface-hover)]'}`}
                          style={{ color: isStarred ? undefined : 'var(--dash-text-3)' }}
                        >
                          {isStarred ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFlag(session.id); }}
                          className={`p-1.5 rounded-xl transition-all duration-200 ${isFlagged ? 'text-red-400 bg-red-400/10' : 'hover:bg-[var(--dash-surface-hover)]'}`}
                          style={{ color: isFlagged ? undefined : 'var(--dash-text-3)' }}
                        >
                          <Flag className={`w-4 h-4 ${isFlagged ? 'fill-current' : ''}`} />
                        </button>
                        <div
                          className="transition-transform duration-300"
                          style={{ color: 'var(--dash-text-3)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Preview */}
                    {firstUserMessage && !isExpanded && (
                      <p className="mt-2 text-sm line-clamp-2 pr-14" style={{ color: 'var(--dash-text-2)' }}>
                        &quot;{firstUserMessage.content}&quot;
                      </p>
                    )}
                  </div>

                  {/* Expanded Messages */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 max-h-96 overflow-y-auto" style={{ borderTop: '1px solid var(--dash-glass-border)' }}>
                      {session.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${message.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              background: message.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.2)',
                              border: '1px solid var(--dash-glass-border)',
                            }}
                          >
                            {message.role === 'user' ? (
                              <User className="w-3.5 h-3.5 text-indigo-400" />
                            ) : (
                              <Bot className="w-3.5 h-3.5 text-green-400" />
                            )}
                          </div>
                          <div
                            className="max-w-[80%] p-3 rounded-2xl"
                            style={
                              message.role === 'user'
                                ? {
                                    background: 'rgba(160,148,224,0.15)',
                                    color: 'var(--dash-text)',
                                    border: '1px solid rgba(160,148,224,0.2)',
                                    borderBottomRightRadius: '4px',
                                  }
                                : {
                                    background: 'var(--dash-muted)',
                                    color: 'var(--dash-text)',
                                    border: '1px solid var(--dash-glass-border)',
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
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
                <MessageCircle className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>
                {searchQuery ? 'לא נמצאו תוצאות' : 'אין שיחות עדיין'}
              </h3>
              <p style={{ color: 'var(--dash-text-2)' }}>
                {searchQuery ? 'נסה לחפש מילים אחרות' : 'שיחות חדשות יופיעו כאן כשהמבקרים ישתמשו בבוט'}
              </p>
            </div>
          )}
        </div>

        {/* Load More */}
        {sessions.length >= 50 && !searchQuery && (
          <div className="mt-8 text-center">
            <button
              onClick={async () => {
                if (!influencer) return;
                const more = await loadSessions(influencer.id, sessions.length);
                setSessions(prev => [...prev, ...more]);
              }}
              className="glass-subtle px-6 py-3 rounded-2xl transition-all duration-300 hover:glass-card"
              style={{ color: 'var(--dash-text)' }}
            >
              טען עוד שיחות
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
