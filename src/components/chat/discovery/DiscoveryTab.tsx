'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiscoveryAll } from '@/hooks/useDiscoveryAll';
import { useDiscovery } from '@/hooks/useDiscovery';
import { useMagicBento } from './useMagicBento';
import { QuestionsView } from './QuestionsView';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';
import type { DiscoveryRow } from '@/hooks/useDiscoveryAll';

interface DiscoveryTabProps {
  username: string;
  influencerName: string;
  sessionId?: string;
  initialCategory?: string | null;
  onAskInChat: (message: string, enrichedData?: string) => void;
  onCategoryOpened?: () => void;
}

function getThumb(item: DiscoveryItem): string | null {
  return item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;
}

export default function DiscoveryTab({
  username, influencerName, sessionId, initialCategory, onAskInChat, onCategoryOpened,
}: DiscoveryTabProps) {
  const { rows, loading, error } = useDiscoveryAll({ username });
  const { questionsData, questionsLoading, loadQuestions, submitNewQuestion, vote } =
    useDiscovery({ username, sessionId });

  const [filter, setFilter] = useState<string | null>(null);
  const [showQ, setShowQ] = useState(false);
  const qLoaded = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showQ && !qLoaded.current) { qLoaded.current = true; loadQuestions(); }
  }, [showQ, loadQuestions]);

  useEffect(() => {
    if (initialCategory === 'questions') { setShowQ(true); onCategoryOpened?.(); }
    else if (initialCategory) { setFilter(initialCategory); onCategoryOpened?.(); }
  }, [initialCategory, onCategoryOpened]);

  const askCategory = useCallback((row: DiscoveryRow) => {
    const title = row.category.title.replace(/\s+של\s+.+$/, '');
    const visibleMsg = `ספרי לי על ${title}`;
    const ctx = row.items.map((it, i) => {
      const t = it.aiTitle || it.captionExcerpt || '';
      const m = it.metricValue && it.metricLabel ? ` (${it.metricLabel}: ${it.metricValue.toLocaleString()})` : '';
      return `${i + 1}. ${t}${m}${it.aiSummary ? ' — ' + it.aiSummary : ''}`;
    }).join('\n');
    onAskInChat(visibleMsg, `[הנתונים מתוך "${row.category.title}":\n${ctx}]\n\n${visibleMsg}`);
  }, [onAskInChat]);

  const visible = filter ? rows.filter(r => r.category.slug === filter) : rows;

  useMagicBento(feedRef, visible.length);

  return (
    <div className="bt-page" dir="rtl">

      {loading && (
        <div className="bt-loading">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#ccc' }} />
        </div>
      )}

      {error && !loading && <p className="bt-empty">{error}</p>}

      {!loading && rows.length > 0 && (
        <>
          <h2 className="bt-title">גלו</h2>

          <nav className="bt-nav">
            <button
              className={`bt-chip ${!filter ? 'bt-chip-on' : ''}`}
              onClick={() => setFilter(null)}
            >הכל</button>
            {rows.map(r => (
              <button
                key={r.category.slug}
                className={`bt-chip ${filter === r.category.slug ? 'bt-chip-on' : ''}`}
                onClick={() => setFilter(filter === r.category.slug ? null : r.category.slug)}
              >{r.category.title.replace(/\s+של\s+.+$/, '')}</button>
            ))}
          </nav>

          <div className="bt-feed" ref={feedRef}>
            {visible.map((row, ri) => (
              <motion.button
                key={row.category.slug}
                className="bt-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ri * 0.04, duration: 0.3, ease: [.22,1,.36,1] }}
                onClick={() => askCategory(row)}
              >
                <p className="bt-card-title">
                  {row.category.title.replace(/\s+של\s+.+$/, '')}
                </p>
                <div className="bt-card-thumbs">
                  {row.items.slice(0, 3).map((item, i) => {
                    const src = getThumb(item);
                    return src ? (
                      <img key={item.postId || item.shortcode || i} src={src} alt="" className="bt-card-thumb" loading="lazy" />
                    ) : (
                      <div key={i} className="bt-card-thumb bt-card-ph" />
                    );
                  })}
                </div>
                <span className="bt-card-count">{row.items.length} פריטים</span>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="bt-empty">אין תוכן זמין כרגע</p>
      )}

      {/* questions */}
      <div className="bt-q">
        <button className="bt-q-btn" onClick={() => setShowQ(!showQ)}>
          <span>שאלות שתמיד רציתם לשאול</span>
          {showQ
            ? <ChevronUp className="w-4 h-4" style={{ color: '#bbb' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: '#bbb' }} />}
        </button>
        <AnimatePresence>
          {showQ && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingTop: 12 }}>
                <QuestionsView
                  data={questionsData}
                  loading={questionsLoading}
                  onBack={() => setShowQ(false)}
                  onSubmit={submitNewQuestion}
                  onVote={vote}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ height: 120 }} />
    </div>
  );
}
