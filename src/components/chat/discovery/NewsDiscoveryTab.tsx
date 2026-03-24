'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, Clock, Flame, ChevronLeft } from 'lucide-react';
import { NewsTicker } from './NewsTicker';
import { getProxiedImageUrl } from '@/lib/image-utils';
import type { HotTopic } from '@/lib/hot-topics/types';

// ============================================
// Types
// ============================================

interface TimelineItem {
  id: string;
  headline: string;
  preview: string;
  postedAt: string;
  likes: number;
  views: number;
  thumbnailUrl: string | null;
}

interface NewsDiscoveryTabProps {
  username: string;
  influencerName: string;
  onAskInChat: (message: string, enrichedData?: string) => void;
}

// ============================================
// Helpers
// ============================================

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 5) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return 'שבוע+';
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  breaking: { color: '#FF3B30', label: 'BREAKING' },
  hot: { color: '#FF9500', label: 'HOT' },
  cooling: { color: '#AF52DE', label: 'TRENDING' },
  archive: { color: '#8E8E93', label: 'ARCHIVE' },
};

// ============================================
// Component
// ============================================

export function NewsDiscoveryTab({ username, influencerName, onAskInChat }: NewsDiscoveryTabProps) {
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [topicsRes, timelineRes] = await Promise.all([
          fetch(`/api/discovery/hot-topics?limit=15&status=breaking,hot,cooling`),
          fetch(`/api/discovery/timeline?username=${encodeURIComponent(username)}&limit=20`),
        ]);
        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setHotTopics(data.topics || []);
        }
        if (timelineRes.ok) {
          const data = await timelineRes.json();
          setTimeline(data.items || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [username]);

  // Handlers
  const handleTopicClick = useCallback((topic: HotTopic) => {
    const enrichedContext = `[נושא חם: ${topic.topic_name} (${topic.status})\nתקציר: ${topic.summary || 'אין תקציר'}\nציון חום: ${topic.heat_score}\n${topic.coverage_count} ערוצים כיסו, ${topic.total_posts} פוסטים]`;
    onAskInChat(`ספרו לי על ${topic.topic_name}`, enrichedContext);
  }, [onAskInChat]);

  const handleTimelineClick = useCallback((item: TimelineItem) => {
    const enrichedContext = `[פוסט אחרון: ${item.headline}\nתקציר: ${item.preview}\nפורסם: ${item.postedAt}\nצפיות: ${item.views}, לייקים: ${item.likes}]`;
    onAskInChat(item.headline.length > 40 ? item.headline.substring(0, 40) + '...' : item.headline, enrichedContext);
  }, [onAskInChat]);

  // Data
  const breakingTopics = hotTopics.filter(t => t.status === 'breaking');
  const hotOnly = hotTopics.filter(t => t.status === 'hot');
  const allTopics = [...breakingTopics, ...hotOnly, ...hotTopics.filter(t => t.status === 'cooling')];
  const heroTopic = breakingTopics[0] || hotOnly[0];
  const postsWithImages = timeline.filter(t => t.thumbnailUrl);
  const heroPost = postsWithImages[0];
  const remainingPosts = postsWithImages.slice(1);

  // Ticker
  const tickerHeadlines = [...breakingTopics, ...hotOnly].slice(0, 8).map(t => ({
    text: t.summary || t.topic_name,
    status: t.status as 'breaking' | 'hot' | 'cooling',
    onClick: () => handleTopicClick(t),
  }));

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: '#F2F2F7' }}>
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF3B30' }} />
          <p className="text-[12px] font-medium" style={{ color: '#8E8E93' }}>טוען עדכונים...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px]" style={{ color: '#8E8E93' }}>{error}</p>
        </div>
      )}

      {/* Main Content */}
      {!loading && (hotTopics.length > 0 || timeline.length > 0) && (
        <>
          {/* ── Ticker ── */}
          {tickerHeadlines.length > 0 && <NewsTicker headlines={tickerHeadlines} />}

          {/* ── Hero Card (Apple News style) ── */}
          {heroPost && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => handleTimelineClick(heroPost)}
              className="w-full relative overflow-hidden"
              style={{ aspectRatio: '16/10' }}
            >
              <img
                src={getProxiedImageUrl(heroPost.thumbnailUrl || '')}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.1) 70%)' }}
              />
              {/* Breaking badge */}
              {heroTopic && (
                <div className="absolute top-3 right-3">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md"
                    style={{
                      background: STATUS_CONFIG[heroTopic.status]?.color || '#FF3B30',
                      color: '#FFF',
                    }}
                  >
                    {STATUS_CONFIG[heroTopic.status]?.label}
                  </span>
                </div>
              )}
              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5" dir="rtl">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {influencerName}
                </p>
                <h1 className="font-black text-[22px] leading-[1.2] text-white mb-2 line-clamp-2">
                  {heroPost.headline}
                </h1>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {formatViews(heroPost.views)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(heroPost.postedAt)}
                  </span>
                </div>
              </div>
            </motion.button>
          )}

          {/* ── Hot Topics Section ── */}
          {allTopics.length > 0 && (
            <section className="px-4 pt-5 pb-1" dir="rtl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4" style={{ color: '#FF3B30' }} />
                  <h2 className="text-[15px] font-bold" style={{ color: '#1C1C1E' }}>נושאים חמים</h2>
                </div>
              </div>

              {/* Horizontal scroll of topic pills */}
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
                {allTopics.slice(0, 8).map((topic, i) => {
                  const cfg = STATUS_CONFIG[topic.status] || STATUS_CONFIG.hot;
                  return (
                    <motion.button
                      key={topic.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTopicClick(topic)}
                      className="flex-shrink-0 text-right overflow-hidden"
                      style={{
                        width: '180px',
                        borderRadius: '16px',
                        background: '#FFF',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* Color accent */}
                      <div className="h-1" style={{ background: cfg.color }} />
                      <div className="p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${topic.status === 'breaking' ? 'animate-pulse' : ''}`}
                            style={{ background: `${cfg.color}18`, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-[9px] font-bold" style={{ color: cfg.color }}>
                            {Math.round(topic.heat_score)}
                          </span>
                        </div>
                        <p className="text-[13px] font-bold leading-snug line-clamp-2" style={{ color: '#1C1C1E' }}>
                          {topic.topic_name}
                        </p>
                        {topic.summary && (
                          <p className="text-[10px] leading-relaxed mt-1 line-clamp-2" style={{ color: '#8E8E93' }}>
                            {topic.summary}
                          </p>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Latest Posts (Apple News cards) ── */}
          {remainingPosts.length > 0 && (
            <section className="px-4 pt-3 pb-2" dir="rtl">
              <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1C1C1E' }}>
                פוסטים אחרונים
              </h2>

              {/* Top 2 — side by side large cards */}
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                {remainingPosts.slice(0, 2).map((item, i) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleTimelineClick(item)}
                    className="relative overflow-hidden text-right"
                    style={{ borderRadius: '16px', aspectRatio: '3/4' }}
                  >
                    <img
                      src={getProxiedImageUrl(item.thumbnailUrl || '')}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.15) 50%, transparent 70%)' }}
                    />
                    {/* Views */}
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                        style={{ background: 'rgba(0,0,0,0.5)', color: '#FFF', backdropFilter: 'blur(8px)' }}
                      >
                        <Eye className="w-2.5 h-2.5" />
                        {formatViews(item.views)}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-[13px] font-bold leading-snug text-white line-clamp-3">
                        {item.headline}
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {timeAgo(item.postedAt)}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Rest — list cards with thumbnail on the side */}
              <div className="space-y-2">
                {remainingPosts.slice(2).map((item, i) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleTimelineClick(item)}
                    className="w-full flex items-stretch overflow-hidden text-right"
                    style={{
                      borderRadius: '14px',
                      background: '#FFF',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
                      minHeight: '88px',
                    }}
                  >
                    {/* Text */}
                    <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                      <p className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: '#1C1C1E' }}>
                        {item.headline}
                      </p>
                      <div className="flex items-center gap-2.5 mt-1.5 text-[10px]" style={{ color: '#AEAEB2' }}>
                        <span>{timeAgo(item.postedAt)}</span>
                        {item.views > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" />
                            {formatViews(item.views)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-[88px]">
                      <img
                        src={getProxiedImageUrl(item.thumbnailUrl || '')}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>
          )}

          {/* ── Posts without thumbnails ── */}
          {timeline.filter(t => !t.thumbnailUrl).length > 0 && (
            <section className="px-4 pt-3" dir="rtl">
              {timeline.filter(t => !t.thumbnailUrl).map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTimelineClick(item)}
                  className="w-full text-right py-3 flex items-start gap-3"
                  style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ background: '#D1D1D6' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: '#1C1C1E' }}>
                      {item.headline}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: '#AEAEB2' }}>
                      <span>{timeAgo(item.postedAt)}</span>
                      {item.views > 0 && <span>{formatViews(item.views)} צפיות</span>}
                    </div>
                  </div>
                </motion.button>
              ))}
            </section>
          )}

          <div className="pb-32" />
        </>
      )}

      {/* Empty state */}
      {!loading && hotTopics.length === 0 && timeline.length === 0 && !error && (
        <div className="px-5 py-20 text-center" dir="rtl">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#E5E5EA' }}
          >
            <Flame className="w-6 h-6" style={{ color: '#AEAEB2' }} />
          </div>
          <p className="text-[14px] font-semibold mb-1" style={{ color: '#1C1C1E' }}>
            אין עדכונים כרגע
          </p>
          <p className="text-[12px]" style={{ color: '#8E8E93' }}>
            חדשות ונושאים חמים יופיעו כאן ברגע שיהיו
          </p>
        </div>
      )}
    </div>
  );
}
