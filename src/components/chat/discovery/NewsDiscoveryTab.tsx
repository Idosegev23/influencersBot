'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { HotTopicCard } from './HotTopicCard';
import { NewsTicker } from './NewsTicker';
import type { HotTopic } from '@/lib/hot-topics/types';

interface TimelineItem {
  id: string;
  headline: string;
  preview: string;
  postedAt: string;
  likes: number;
  views: number;
}

interface NewsDiscoveryTabProps {
  username: string;
  influencerName: string;
  onAskInChat: (message: string, enrichedData?: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 5) return 'עכשיו';
  if (mins < 60) return `${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `${days} ימים`;
  return 'שבוע+';
}

export function NewsDiscoveryTab({ username, influencerName, onAskInChat }: NewsDiscoveryTabProps) {
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'breaking' | 'hot' | 'latest'>('all');

  useEffect(() => {
    async function fetchData() {
      try {
        const [topicsRes, timelineRes] = await Promise.all([
          fetch(`/api/discovery/hot-topics?limit=15&status=breaking,hot,cooling`),
          fetch(`/api/discovery/timeline?username=${encodeURIComponent(username)}&limit=12`),
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

  // Split topics
  const breakingTopics = hotTopics.filter(t => t.status === 'breaking');
  const hotOnly = hotTopics.filter(t => t.status === 'hot');
  const coolingTopics = hotTopics.filter(t => t.status === 'cooling');
  const allTopics = [...breakingTopics, ...hotOnly, ...coolingTopics];

  // Hero topic = first breaking or hottest
  const heroTopic = breakingTopics[0] || hotOnly[0];
  const remainingTopics = allTopics.filter(t => t.id !== heroTopic?.id);

  // Filter logic
  const filteredTopics = activeFilter === 'all' ? remainingTopics
    : activeFilter === 'breaking' ? remainingTopics.filter(t => t.status === 'breaking')
    : activeFilter === 'hot' ? remainingTopics.filter(t => t.status === 'hot' || t.status === 'cooling')
    : [];

  const showTimeline = activeFilter === 'all' || activeFilter === 'latest';

  // Ticker
  const tickerHeadlines = [...breakingTopics, ...hotOnly].slice(0, 8).map(t => ({
    text: t.summary || t.topic_name,
    status: t.status as 'breaking' | 'hot' | 'cooling',
    onClick: () => handleTopicClick(t),
  }));

  const filters = [
    { id: 'all' as const, label: 'הכל' },
    { id: 'breaking' as const, label: 'בריקינג', count: breakingTopics.length },
    { id: 'hot' as const, label: 'חם', count: hotOnly.length + coolingTopics.length },
    { id: 'latest' as const, label: 'עכשיו', count: timeline.length },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="relative">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF3B30' }} />
            <div className="absolute inset-0 animate-ping opacity-20">
              <Loader2 className="w-6 h-6" style={{ color: '#FF3B30' }} />
            </div>
          </div>
          <p className="text-[12px] font-medium" style={{ color: '#8E8E93' }}>טוען עדכונים...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px]" style={{ color: '#8E8E93' }}>{error}</p>
        </div>
      )}

      {/* Content */}
      {!loading && (hotTopics.length > 0 || timeline.length > 0) && (
        <>
          {/* Ticker */}
          {tickerHeadlines.length > 0 && (
            <NewsTicker headlines={tickerHeadlines} />
          )}

          {/* Hero Card */}
          {heroTopic && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 pt-4"
            >
              <HotTopicCard
                topicName={heroTopic.topic_name}
                summary={heroTopic.summary}
                status={heroTopic.status}
                heatScore={heroTopic.heat_score}
                coverageCount={heroTopic.coverage_count}
                totalPosts={heroTopic.total_posts}
                tags={heroTopic.tags}
                onClick={() => handleTopicClick(heroTopic)}
                variant="hero"
              />
            </motion.div>
          )}

          {/* Filter pills */}
          <div className="px-4 pt-4 pb-2" dir="rtl">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all"
                  style={{
                    backgroundColor: activeFilter === f.id ? '#1C1C1E' : '#FFFFFF',
                    color: activeFilter === f.id ? '#FFFFFF' : '#636366',
                    boxShadow: activeFilter === f.id
                      ? '0 2px 8px rgba(0,0,0,0.2)'
                      : '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)',
                  }}
                >
                  {f.label}
                  {f.count !== undefined && f.count > 0 && (
                    <span
                      className="text-[10px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1"
                      style={{
                        backgroundColor: activeFilter === f.id ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                        color: activeFilter === f.id ? 'rgba(255,255,255,0.8)' : '#8E8E93',
                      }}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Topic cards */}
          {filteredTopics.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 space-y-2.5 pt-1"
              dir="rtl"
            >
              {filteredTopics.map((topic, i) => (
                <motion.div
                  key={topic.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <HotTopicCard
                    topicName={topic.topic_name}
                    summary={topic.summary}
                    status={topic.status}
                    heatScore={topic.heat_score}
                    coverageCount={topic.coverage_count}
                    totalPosts={topic.total_posts}
                    tags={topic.tags}
                    onClick={() => handleTopicClick(topic)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Timeline */}
          {showTimeline && timeline.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="px-4 pt-5"
              dir="rtl"
            >
              {/* Timeline header */}
              <div className="flex items-center gap-2.5 mb-3 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#34C759', boxShadow: '0 0 6px rgba(52,199,89,0.4)' }} />
                <span className="text-[12px] font-bold tracking-wide uppercase" style={{ color: '#636366' }}>
                  LIVE FEED
                </span>
              </div>

              <div className="relative">
                {/* Vertical line */}
                <div
                  className="absolute right-[7px] top-2 bottom-2 w-px"
                  style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
                />

                <div className="space-y-1">
                  {timeline.map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleTimelineClick(item)}
                      className="w-full text-right flex items-start gap-3 py-2.5 pr-0 pl-2 rounded-xl transition-colors"
                      style={{ background: 'transparent' }}
                      dir="rtl"
                    >
                      {/* Time dot */}
                      <div className="flex-shrink-0 pt-1 relative z-10">
                        <div
                          className="w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center"
                          style={{
                            borderColor: i === 0 ? '#34C759' : '#D1D1D6',
                            backgroundColor: '#F5F5F7',
                          }}
                        >
                          {i === 0 && (
                            <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: '#34C759' }} />
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: i === 0 ? '#34C759' : '#AEAEB2' }}>
                            {timeAgo(item.postedAt)}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold leading-snug" style={{ color: '#1C1C1E' }}>
                          {item.headline}
                        </p>
                        {item.preview && item.preview !== item.headline && (
                          <p className="text-[11px] leading-relaxed mt-0.5 line-clamp-1" style={{ color: '#AEAEB2' }}>
                            {item.preview}
                          </p>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.section>
          )}

          {/* Bottom padding */}
          <div className="pb-32" />
        </>
      )}

      {/* Empty state */}
      {!loading && hotTopics.length === 0 && timeline.length === 0 && !error && (
        <div className="px-5 py-20 text-center" dir="rtl">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1C1C1E, #2C2C2E)' }}
          >
            <span className="text-2xl">📡</span>
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
