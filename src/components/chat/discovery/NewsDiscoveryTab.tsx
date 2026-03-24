'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Eye, Clock, Flame, TrendingUp } from 'lucide-react';
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

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  breaking: { color: '#FF3B30', bg: '#FFF1F0', label: 'BREAKING' },
  hot: { color: '#FF9500', bg: '#FFF8F0', label: 'HOT' },
  cooling: { color: '#AF52DE', bg: '#F8F0FF', label: 'TRENDING' },
  archive: { color: '#8E8E93', bg: '#F2F2F7', label: 'ARCHIVE' },
};

// ============================================
// Sub-components
// ============================================

/** Image card with gradient overlay — used for hero and grid */
function ImageCard({
  thumbnailUrl,
  headline,
  views,
  postedAt,
  badge,
  aspectRatio = '4/5',
  headlineSize = '18px',
  onClick,
}: {
  thumbnailUrl: string;
  headline: string;
  views: number;
  postedAt: string;
  badge?: { label: string; color: string };
  aspectRatio?: string;
  headlineSize?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full relative overflow-hidden text-right"
      style={{ borderRadius: '20px', aspectRatio }}
    >
      <img
        src={getProxiedImageUrl(thumbnailUrl)}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 65%)' }}
      />
      {badge && (
        <div className="absolute top-3 right-3">
          <span
            className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg"
            style={{ background: badge.color, color: '#FFF' }}
          >
            {badge.label}
          </span>
        </div>
      )}
      {views > 0 && (
        <div className="absolute top-3 left-3">
          <span
            className="text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#FFF', backdropFilter: 'blur(8px)' }}
          >
            <Eye className="w-3 h-3" />
            {formatViews(views)}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-4" dir="rtl">
        <h3
          className="font-black leading-[1.2] text-white line-clamp-2"
          style={{ fontSize: headlineSize }}
        >
          {headline}
        </h3>
        <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <Clock className="w-3 h-3" />
          {timeAgo(postedAt)}
        </p>
      </div>
    </motion.button>
  );
}

/** List-style card with side thumbnail */
function ListCard({
  headline,
  thumbnailUrl,
  views,
  postedAt,
  onClick,
}: {
  headline: string;
  thumbnailUrl: string | null;
  views: number;
  postedAt: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-stretch overflow-hidden text-right"
      style={{
        borderRadius: '16px',
        background: '#FFF',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
        minHeight: '90px',
      }}
    >
      <div className="flex-1 p-3.5 flex flex-col justify-center min-w-0" dir="rtl">
        <p className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: '#1C1C1E' }}>
          {headline}
        </p>
        <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: '#AEAEB2' }}>
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo(postedAt)}
          </span>
          {views > 0 && (
            <span className="flex items-center gap-0.5">
              <Eye className="w-2.5 h-2.5" />
              {formatViews(views)}
            </span>
          )}
        </div>
      </div>
      {thumbnailUrl && (
        <div className="flex-shrink-0 w-[80px]" style={{ aspectRatio: '4/5' }}>
          <img
            src={getProxiedImageUrl(thumbnailUrl)}
            alt=""
            className="w-full h-full object-cover rounded-l-2xl"
            loading="lazy"
          />
        </div>
      )}
    </motion.button>
  );
}

// ============================================
// Main Component
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

  const handlePostClick = useCallback((item: TimelineItem) => {
    const enrichedContext = `[פוסט אחרון: ${item.headline}\nתקציר: ${item.preview}\nפורסם: ${item.postedAt}\nצפיות: ${item.views}, לייקים: ${item.likes}]`;
    onAskInChat(item.headline.length > 40 ? item.headline.substring(0, 40) + '...' : item.headline, enrichedContext);
  }, [onAskInChat]);

  // Data
  const breakingTopics = hotTopics.filter(t => t.status === 'breaking');
  const hotOnly = hotTopics.filter(t => t.status === 'hot');
  const allTopics = [...breakingTopics, ...hotOnly, ...hotTopics.filter(t => t.status === 'cooling')];
  const heroTopic = breakingTopics[0] || hotOnly[0];

  const postsWithImages = timeline.filter(t => t.thumbnailUrl);
  const postsNoImages = timeline.filter(t => !t.thumbnailUrl);
  // Split posts into two columns for masonry layout
  const leftCol = postsWithImages.filter((_, i) => i % 2 === 0);
  const rightCol = postsWithImages.filter((_, i) => i % 2 === 1);

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

      {/* ═══════════════════════════════════════ */}
      {/* MAIN CONTENT                            */}
      {/* ═══════════════════════════════════════ */}
      {!loading && (hotTopics.length > 0 || timeline.length > 0) && (
        <>
          {/* ── Ticker ── */}
          {tickerHeadlines.length > 0 && <NewsTicker headlines={tickerHeadlines} />}

          {/* ── MASONRY GRID (2 columns, portrait cards) ── */}
          {postsWithImages.length > 0 && (
            <div className="px-3 pt-4 flex gap-2.5">
              {/* Left column */}
              <div className="flex-1 flex flex-col gap-2.5">
                {leftCol.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <ImageCard
                      thumbnailUrl={item.thumbnailUrl!}
                      headline={item.headline}
                      views={item.views}
                      postedAt={item.postedAt}
                      badge={i === 0 && heroTopic ? { label: STATUS_CONFIG[heroTopic.status]?.label || 'LIVE', color: STATUS_CONFIG[heroTopic.status]?.color || '#FF3B30' } : undefined}
                      aspectRatio={i === 0 ? '3/5' : '4/5'}
                      headlineSize={i === 0 ? '16px' : '13px'}
                      onClick={() => handlePostClick(item)}
                    />
                  </motion.div>
                ))}
              </div>
              {/* Right column — offset top for staggered look */}
              <div className="flex-1 flex flex-col gap-2.5 pt-6">
                {rightCol.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 + i * 0.06 }}
                  >
                    <ImageCard
                      thumbnailUrl={item.thumbnailUrl!}
                      headline={item.headline}
                      views={item.views}
                      postedAt={item.postedAt}
                      aspectRatio="4/5"
                      headlineSize="13px"
                      onClick={() => handlePostClick(item)}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* ── HOT TOPICS ── */}
          {allTopics.length > 0 && (
            <section className="pt-5 pb-1" dir="rtl">
              <div className="flex items-center gap-2 px-4 mb-3">
                <Flame className="w-4 h-4" style={{ color: '#FF3B30' }} />
                <h2 className="text-[16px] font-bold" style={{ color: '#1C1C1E' }}>
                  נושאים חמים
                </h2>
              </div>

              <div className="px-4 space-y-2">
                {allTopics.slice(0, 6).map((topic, i) => {
                  const cfg = STATUS_CONFIG[topic.status] || STATUS_CONFIG.hot;
                  return (
                    <motion.button
                      key={topic.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleTopicClick(topic)}
                      className="w-full text-right overflow-hidden flex items-stretch"
                      style={{
                        borderRadius: '16px',
                        background: '#FFF',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
                      }}
                    >
                      {/* Color accent bar */}
                      <div className="w-1 flex-shrink-0" style={{ background: cfg.color }} />
                      <div className="flex-1 p-3.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${topic.status === 'breaking' ? 'animate-pulse' : ''}`}
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          <div className="flex-1" />
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" style={{ color: cfg.color }} />
                            <span className="text-[10px] font-bold" style={{ color: cfg.color }}>
                              {Math.round(topic.heat_score)}
                            </span>
                          </div>
                        </div>
                        <h3 className="text-[14px] font-bold leading-snug" style={{ color: '#1C1C1E' }}>
                          {topic.topic_name}
                        </h3>
                        {topic.summary && (
                          <p className="text-[11px] leading-relaxed mt-1 line-clamp-2" style={{ color: '#8E8E93' }}>
                            {topic.summary}
                          </p>
                        )}
                        {topic.tags && topic.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            {topic.tags.slice(0, 3).map(tag => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: '#F2F2F7', color: '#8E8E93' }}
                              >
                                {tag}
                              </span>
                            ))}
                            <span className="text-[9px]" style={{ color: '#C7C7CC' }}>
                              {topic.coverage_count} ערוצים
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── TEXT-ONLY POSTS ── */}
          {postsNoImages.length > 0 && (
            <section className="px-4 pt-3" dir="rtl">
              {postsNoImages.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePostClick(item)}
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
