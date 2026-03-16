'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { useDiscoveryAll } from '@/hooks/useDiscoveryAll';
import { useDiscovery } from '@/hooks/useDiscovery';
import { DiscoveryRow } from './DiscoveryRow';
import { QuestionsView } from './QuestionsView';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryTabProps {
  username: string;
  influencerName: string;
  sessionId?: string;
  initialCategory?: string | null;
  onAskInChat: (message: string, enrichedData?: string) => void;
  onCategoryOpened?: () => void;
}

export default function DiscoveryTab({ username, influencerName, sessionId, initialCategory, onAskInChat, onCategoryOpened }: DiscoveryTabProps) {
  const { rows, loading, error } = useDiscoveryAll({ username });
  const {
    questionsData,
    questionsLoading,
    loadQuestions,
    submitNewQuestion,
    vote,
  } = useDiscovery({ username, sessionId });

  const [showQuestions, setShowQuestions] = useState(false);
  const questionsLoadedRef = useRef(false);

  useEffect(() => {
    if (showQuestions && !questionsLoadedRef.current) {
      questionsLoadedRef.current = true;
      loadQuestions();
    }
  }, [showQuestions, loadQuestions]);

  useEffect(() => {
    if (initialCategory === 'questions') {
      setShowQuestions(true);
      onCategoryOpened?.();
    } else if (initialCategory) {
      onCategoryOpened?.();
    }
  }, [initialCategory, onCategoryOpened]);

  const handleItemClick = (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => {
    const title = item.aiTitle || item.captionExcerpt;
    const truncated = title.length > 80 ? title.slice(0, 80) + '...' : title;
    const visibleMsg = `ספרי לי עוד על: ${truncated}`;

    const row = rows.find(r => r.category.slug === categorySlug);
    let enrichedData: string | undefined;
    if (row) {
      const contextLines = row.items.map((it, idx) => {
        const t = it.aiTitle || it.captionExcerpt || '';
        const summary = it.aiSummary || '';
        const metric = it.metricValue && it.metricLabel
          ? ` (${it.metricLabel}: ${it.metricValue.toLocaleString()})`
          : '';
        return `${idx + 1}. ${t}${metric}${summary ? ' — ' + summary : ''}`;
      }).join('\n');
      enrichedData = `[הנתונים מתוך הרשימה "${categoryTitle}":\n${contextLines}]\n\nספרי לי עוד על: ${truncated}`;
    }

    onAskInChat(visibleMsg, enrichedData);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: '#f4f5f7' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3" dir="rtl">
        <div className="flex items-center gap-2 mb-0.5">
          <Sparkles className="w-5 h-5" style={{ color: '#e5a00d' }} />
          <h2 className="text-[22px] font-bold" style={{ color: '#0c1013' }}>
            גלו תוכן
          </h2>
        </div>
        <p className="text-[13px]" style={{ color: '#676767' }}>
          הרשימות הכי מעניינות של {influencerName}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#bbb' }} />
          <p className="text-[14px]" style={{ color: '#999' }}>טוען תוכן...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-4 py-16 text-center">
          <p className="text-[14px]" style={{ color: '#999' }}>{error}</p>
        </div>
      )}

      {/* Marquee rows — each row has its own fade edges */}
      {!loading && rows.length > 0 && (
        <div className="pt-1 pb-4">
          {rows.map((row, idx) => {
            // Different speed per row so they don't move in sync
            const speeds = [28, 38, 22, 34, 26, 42, 30, 36];
            const duration = speeds[idx % speeds.length];
            return (
              <DiscoveryRow
                key={row.category.slug}
                slug={row.category.slug}
                title={row.category.title}
                subtitle={row.category.subtitle}
                color={row.category.color}
                items={row.items}
                onItemClick={handleItemClick}
                reverse={idx % 2 === 1}
                duration={duration}
              />
            );
          })}
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && !error && (
        <div className="px-4 py-16 text-center">
          <p className="text-[28px] mb-2 opacity-30">🔍</p>
          <p className="text-[14px]" style={{ color: '#999' }}>אין רשימות זמינות כרגע</p>
        </div>
      )}

      {/* Questions */}
      <div className="mt-2 mx-4 mb-32">
        <button
          onClick={() => setShowQuestions(!showQuestions)}
          className="w-full flex items-center justify-between rounded-[20px] p-4 transition-colors"
          style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <span className="text-[16px]">❓</span>
            <span className="text-[15px] font-semibold" style={{ color: '#0c1013' }}>
              שאלות שתמיד רציתם לשאול
            </span>
          </div>
          {showQuestions
            ? <ChevronUp className="w-5 h-5" style={{ color: '#676767' }} />
            : <ChevronDown className="w-5 h-5" style={{ color: '#676767' }} />
          }
        </button>

        <AnimatePresence>
          {showQuestions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pt-2">
                <QuestionsView
                  data={questionsData}
                  loading={questionsLoading}
                  onBack={() => setShowQuestions(false)}
                  onSubmit={submitNewQuestion}
                  onVote={vote}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
