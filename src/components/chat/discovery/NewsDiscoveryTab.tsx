'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Flame, Clock, Newspaper } from 'lucide-react';
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
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'עכשיו';
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return `לפני שבוע`;
}

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

  // Split topics by status
  const breakingTopics = hotTopics.filter(t => t.status === 'breaking');
  const hotOnly = hotTopics.filter(t => t.status === 'hot');
  const coolingTopics = hotTopics.filter(t => t.status === 'cooling');

  // Ticker headlines from breaking + hot
  const tickerHeadlines = [...breakingTopics, ...hotOnly].slice(0, 8).map(t => ({
    text: t.summary || t.topic_name,
    status: t.status as 'breaking' | 'hot' | 'cooling',
    onClick: () => handleTopicClick(t),
  }));

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: '#f8f9fb' }}>
      <div className="max-w-[700px] mx-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between" dir="rtl">
          <div>
            <h1 className="font-bold text-[20px] tracking-tight flex items-center gap-2" style={{ color: '#191c1e' }}>
              <Flame className="w-5 h-5" style={{ color: '#FF4444' }} />
              מה חם עכשיו
            </h1>
            <p className="text-[13px] font-medium" style={{ color: '#444749' }}>
              הנושאים הכי חמים והכי חדשים
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF6B00' }} />
            <p className="text-[13px]" style={{ color: '#9ca3af' }}>טוען חדשות...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px]" style={{ color: '#9ca3af' }}>{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && (hotTopics.length > 0 || timeline.length > 0) && (
          <>
            {/* News Ticker */}
            {tickerHeadlines.length > 0 && (
              <NewsTicker headlines={tickerHeadlines} />
            )}

            {/* Breaking section */}
            {breakingTopics.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-5 pt-4"
                dir="rtl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[13px] font-bold animate-pulse" style={{ color: '#FF0000' }}>
                    BREAKING
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: '#FFE5E5' }} />
                </div>
                <div className="space-y-3">
                  {breakingTopics.slice(0, 5).map((topic) => (
                    <HotTopicCard
                      key={topic.id}
                      topicName={topic.topic_name}
                      summary={topic.summary}
                      status={topic.status}
                      heatScore={topic.heat_score}
                      coverageCount={topic.coverage_count}
                      totalPosts={topic.total_posts}
                      tags={topic.tags}
                      onClick={() => handleTopicClick(topic)}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Hot section */}
            {hotOnly.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="px-5 pt-5"
                dir="rtl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4" style={{ color: '#FF6B00' }} />
                  <span className="text-[13px] font-bold" style={{ color: '#FF6B00' }}>
                    חם עכשיו
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: '#FFF3E5' }} />
                </div>
                <div className="space-y-3">
                  {hotOnly.slice(0, 5).map((topic) => (
                    <HotTopicCard
                      key={topic.id}
                      topicName={topic.topic_name}
                      summary={topic.summary}
                      status={topic.status}
                      heatScore={topic.heat_score}
                      coverageCount={topic.coverage_count}
                      totalPosts={topic.total_posts}
                      tags={topic.tags}
                      onClick={() => handleTopicClick(topic)}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Timeline — הכי חדש */}
            {timeline.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="px-5 pt-5"
                dir="rtl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="w-4 h-4" style={{ color: '#3B82F6' }} />
                  <span className="text-[13px] font-bold" style={{ color: '#3B82F6' }}>
                    הכי חדש
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: '#E5EFFF' }} />
                </div>
                <div className="space-y-2">
                  {timeline.map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleTimelineClick(item)}
                      className="w-full text-right rounded-xl p-3 transition-all"
                      style={{
                        background: 'white',
                        border: '1px solid #f0f0f0',
                      }}
                      dir="rtl"
                    >
                      <div className="flex items-start gap-3">
                        {/* Time marker */}
                        <div className="flex-shrink-0 pt-0.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3B82F6' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-snug mb-0.5" style={{ color: '#191c1e' }}>
                            {item.headline}
                          </p>
                          <span className="text-[11px]" style={{ color: '#999' }}>
                            {timeAgo(item.postedAt)}
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Cooling section */}
            {coolingTopics.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="px-5 pt-5"
                dir="rtl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" style={{ color: '#FFA500' }} />
                  <span className="text-[13px] font-bold" style={{ color: '#FFA500' }}>
                    עדיין מדברים על זה
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: '#FFF8E5' }} />
                </div>
                <div className="space-y-3">
                  {coolingTopics.slice(0, 5).map((topic) => (
                    <HotTopicCard
                      key={topic.id}
                      topicName={topic.topic_name}
                      summary={topic.summary}
                      status={topic.status}
                      heatScore={topic.heat_score}
                      coverageCount={topic.coverage_count}
                      totalPosts={topic.total_posts}
                      tags={topic.tags}
                      onClick={() => handleTopicClick(topic)}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Bottom padding */}
            <div className="pb-32" />
          </>
        )}

        {/* Empty state */}
        {!loading && hotTopics.length === 0 && timeline.length === 0 && !error && (
          <div className="px-5 py-16 text-center" dir="rtl">
            <Flame className="w-10 h-10 mx-auto mb-3" style={{ color: '#ddd' }} />
            <p className="text-[14px] font-medium mb-1" style={{ color: '#666' }}>
              אין חדשות כרגע
            </p>
            <p className="text-[12px]" style={{ color: '#999' }}>
              חדשות ונושאים חמים יופיעו כאן אחרי שהמערכת תנתח את התוכן
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
