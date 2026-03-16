'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useDiscoveryAll, type DiscoveryRow as DiscoveryRowType } from '@/hooks/useDiscoveryAll';
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

  // Load questions when section is expanded
  useEffect(() => {
    if (showQuestions && !questionsLoadedRef.current) {
      questionsLoadedRef.current = true;
      loadQuestions();
    }
  }, [showQuestions, loadQuestions]);

  // Handle initial category from empty state pills
  useEffect(() => {
    if (initialCategory === 'questions') {
      setShowQuestions(true);
      onCategoryOpened?.();
    } else if (initialCategory) {
      onCategoryOpened?.();
    }
  }, [initialCategory, onCategoryOpened]);

  // Handle card click → send enriched message to chat
  const handleItemClick = (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => {
    const title = item.aiTitle || item.captionExcerpt;
    const truncated = title.length > 80 ? title.slice(0, 80) + '...' : title;
    const visibleMsg = `ספרי לי עוד על: ${truncated}`;

    // Build enriched context from the row's items
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
      <div className="px-4 pt-4 pb-2" dir="rtl">
        <h2 className="text-[22px] font-bold" style={{ color: '#0c1013' }}>
          גלו תוכן ✨
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: '#676767' }}>
          הרשימות הכי מעניינות של {influencerName}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#999' }} />
          <p className="text-[14px]" style={{ color: '#999' }}>טוען תוכן...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="px-4 py-12 text-center">
          <p className="text-[14px]" style={{ color: '#999' }}>{error}</p>
        </div>
      )}

      {/* Netflix rows */}
      {!loading && rows.length > 0 && (
        <div className="pt-2">
          {rows.map((row) => (
            <DiscoveryRow
              key={row.category.slug}
              slug={row.category.slug}
              title={row.category.title}
              subtitle={row.category.subtitle}
              color={row.category.color}
              icon={row.category.icon}
              items={row.items}
              onItemClick={handleItemClick}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="px-4 py-12 text-center">
          <p className="text-[16px] mb-1" style={{ color: '#999' }}>🔍</p>
          <p className="text-[14px]" style={{ color: '#999' }}>אין רשימות זמינות כרגע</p>
        </div>
      )}

      {/* Questions section (expandable) */}
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
