'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, Clock, Flame, Zap, TrendingUp } from 'lucide-react';
import { NewsTicker } from './NewsTicker';
import { getProxiedImageUrl } from '@/lib/image-utils';
import type { HotTopic } from '@/lib/hot-topics/types';

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

const STATUS_COLORS = {
  breaking: { bg: '#FF3B30', text: '#FFF', glow: 'rgba(255,59,48,0.3)', label: 'BREAKING' },
  hot: { bg: '#FF9500', text: '#FFF', glow: 'rgba(255,149,0,0.25)', label: 'HOT' },
  cooling: { bg: '#AF52DE', text: '#FFF', glow: 'rgba(175,82,222,0.2)', label: 'TRENDING' },
  archive: { bg: '#8E8E93', text: '#FFF', glow: 'transparent', label: 'ARCHIVE' },
};

export function NewsDiscoveryTab({ username, influencerName, onAskInChat }: NewsDiscoveryTabProps) {
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'topics'>('feed');

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

  const handleTopicClick = useCallback((topic: HotTopic) => {
    const enrichedContext = `[נושא חם: ${topic.topic_name} (${topic.status})\nתקציר: ${topic.summary || 'אין תקציר'}\nציון חום: ${topic.heat_score}\n${topic.coverage_count} ערוצים כיסו, ${topic.total_posts} פוסטים]`;
    onAskInChat(`ספרו לי על ${topic.topic_name}`, enrichedContext);
  }, [onAskInChat]);

  const handleTimelineClick = useCallback((item: TimelineItem) => {
    const enrichedContext = `[פוסט אחרון: ${item.headline}\nתקציר: ${item.preview}\nפורסם: ${item.postedAt}\nצפיות: ${item.views}, לייקים: ${item.likes}]`;
    onAskInChat(item.headline.length > 40 ? item.headline.substring(0, 40) + '...' : item.headline, enrichedContext);
  }, [onAskInChat]);

  // Organize data
  const breakingTopics = hotTopics.filter(t => t.status === 'breaking');
  const hotOnly = hotTopics.filter(t => t.status === 'hot');
  const coolingTopics = hotTopics.filter(t => t.status === 'cooling');
  const allTopics = [...breakingTopics, ...hotOnly, ...coolingTopics];

  // Ticker
  const tickerHeadlines = [...breakingTopics, ...hotOnly].slice(0, 8).map(t => ({
    text: t.summary || t.topic_name,
    status: t.status as 'breaking' | 'hot' | 'cooling',
    onClick: () => handleTopicClick(t),
  }));

  // Hero = top timeline post with thumbnail (visual impact)
  const heroPost = timeline.find(t => t.thumbnailUrl);
  const heroTopic = breakingTopics[0] || hotOnly[0];

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#000' }}>
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF3B30' }} />
          <p className="text-[12px] font-medium" style={{ color: '#666' }}>טוען עדכונים...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px]" style={{ color: '#666' }}>{error}</p>
        </div>
      )}

      {/* Content */}
      {!loading && (hotTopics.length > 0 || timeline.length > 0) && (
        <>
          {/* Ticker */}
          {tickerHeadlines.length > 0 && (
            <NewsTicker headlines={tickerHeadlines} />
          )}

          {/* Hero Section — full-width image with overlay */}
          {heroPost && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTimelineClick(heroPost)}
              className="w-full relative overflow-hidden"
              style={{ aspectRatio: '16/9' }}
            >
              <img
                src={getProxiedImageUrl(heroPost.thumbnailUrl || '')}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Gradient overlay */}
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)' }}
              />
              {/* Breaking badge */}
              {heroTopic && (
                <div className="absolute top-3 right-3">
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md animate-pulse"
                    style={{
                      background: STATUS_COLORS[heroTopic.status]?.bg || '#FF3B30',
                      color: '#FFF',
                      boxShadow: `0 2px 12px ${STATUS_COLORS[heroTopic.status]?.glow || 'rgba(255,59,48,0.4)'}`,
                    }}
                  >
                    {STATUS_COLORS[heroTopic.status]?.label || 'LIVE'}
                  </span>
                </div>
              )}
              {/* Content overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4" dir="rtl">
                <h2 className="font-black text-[18px] leading-tight text-white mb-1.5 line-clamp-2">
                  {heroPost.headline}
                </h2>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
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

          {/* Tab switcher */}
          <div className="sticky top-0 z-20" style={{ background: '#000' }}>
            <div className="flex" dir="rtl">
              {([
                { id: 'feed' as const, label: 'פיד', icon: Zap },
                { id: 'topics' as const, label: 'נושאים חמים', icon: Flame },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold transition-colors relative"
                  style={{ color: activeTab === tab.id ? '#FFF' : '#666' }}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="news-tab-indicator"
                      className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                      style={{ background: '#FF3B30' }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* FEED TAB — Posts with thumbnails */}
            {activeTab === 'feed' && (
              <motion.div
                key="feed"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="px-3 pt-3 pb-32"
                dir="rtl"
              >
                {/* 2-column grid of posts with thumbnails */}
                <div className="grid grid-cols-2 gap-2.5">
                  {timeline.filter(item => item.thumbnailUrl).slice(heroPost ? 1 : 0).map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleTimelineClick(item)}
                      className="relative overflow-hidden text-right"
                      style={{
                        borderRadius: '14px',
                        aspectRatio: i % 3 === 0 ? '3/4' : '4/5',
                      }}
                    >
                      <img
                        src={getProxiedImageUrl(item.thumbnailUrl || '')}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 70%)' }}
                      />
                      {/* Views badge */}
                      <div className="absolute top-2 left-2">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                          style={{ background: 'rgba(0,0,0,0.6)', color: '#FFF', backdropFilter: 'blur(4px)' }}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          {formatViews(item.views)}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <p className="text-[12px] font-bold leading-snug text-white line-clamp-3">
                          {item.headline}
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {timeAgo(item.postedAt)}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Posts without thumbnails — compact list */}
                {timeline.filter(item => !item.thumbnailUrl).length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {timeline.filter(item => !item.thumbnailUrl).map((item, i) => (
                      <motion.button
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 + i * 0.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleTimelineClick(item)}
                        className="w-full text-right p-3 rounded-xl flex items-start gap-3"
                        style={{ background: '#111' }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-snug text-white line-clamp-2">
                            {item.headline}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: '#666' }}>
                            <span>{timeAgo(item.postedAt)}</span>
                            {item.views > 0 && <span>{formatViews(item.views)} צפיות</span>}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TOPICS TAB — Hot topics */}
            {activeTab === 'topics' && (
              <motion.div
                key="topics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="px-3 pt-3 pb-32 space-y-2.5"
                dir="rtl"
              >
                {allTopics.map((topic, i) => {
                  const statusConfig = STATUS_COLORS[topic.status] || STATUS_COLORS.hot;
                  return (
                    <motion.button
                      key={topic.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleTopicClick(topic)}
                      className="w-full text-right overflow-hidden"
                      style={{
                        borderRadius: '16px',
                        background: i === 0 ? 'linear-gradient(145deg, #1A1A1A, #111)' : '#111',
                        border: i === 0 ? `1px solid ${statusConfig.bg}33` : '1px solid #222',
                      }}
                    >
                      {i === 0 && (
                        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${statusConfig.bg}, transparent)` }} />
                      )}
                      <div className={i === 0 ? 'p-4' : 'p-3.5'}>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${topic.status === 'breaking' ? 'animate-pulse' : ''}`}
                            style={{
                              background: statusConfig.bg,
                              color: '#FFF',
                              boxShadow: topic.status === 'breaking' ? `0 0 8px ${statusConfig.glow}` : 'none',
                            }}
                          >
                            {statusConfig.label}
                          </span>
                          {/* Heat bar */}
                          <div className="flex-1" />
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" style={{ color: statusConfig.bg }} />
                            <span className="text-[10px] font-bold" style={{ color: statusConfig.bg }}>
                              {Math.round(topic.heat_score)}
                            </span>
                          </div>
                        </div>
                        <h3
                          className={`font-bold leading-snug mb-1 ${i === 0 ? 'text-[17px]' : 'text-[14px]'}`}
                          style={{ color: '#FFF' }}
                        >
                          {topic.topic_name}
                        </h3>
                        {topic.summary && (
                          <p
                            className={`leading-relaxed ${i === 0 ? 'text-[12px] line-clamp-3' : 'text-[11px] line-clamp-2'}`}
                            style={{ color: '#888' }}
                          >
                            {topic.summary}
                          </p>
                        )}
                        {topic.tags && topic.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            {topic.tags.slice(0, 3).map(tag => (
                              <span
                                key={tag}
                                className="text-[9px] px-2 py-0.5 rounded-full"
                                style={{ background: '#222', color: '#888' }}
                              >
                                {tag}
                              </span>
                            ))}
                            <span className="text-[9px]" style={{ color: '#444' }}>
                              {topic.coverage_count} ערוצים
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}

                {allTopics.length === 0 && (
                  <div className="text-center py-12">
                    <Flame className="w-8 h-8 mx-auto mb-2" style={{ color: '#333' }} />
                    <p className="text-[13px]" style={{ color: '#666' }}>אין נושאים חמים כרגע</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Empty state */}
      {!loading && hotTopics.length === 0 && timeline.length === 0 && !error && (
        <div className="px-5 py-20 text-center" dir="rtl">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#111' }}
          >
            <Zap className="w-6 h-6" style={{ color: '#333' }} />
          </div>
          <p className="text-[14px] font-semibold mb-1" style={{ color: '#FFF' }}>
            אין עדכונים כרגע
          </p>
          <p className="text-[12px]" style={{ color: '#666' }}>
            חדשות ונושאים חמים יופיעו כאן ברגע שיהיו
          </p>
        </div>
      )}
    </div>
  );
}
