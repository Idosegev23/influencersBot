'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useDiscoveryAll } from '@/hooks/useDiscoveryAll';
import { useDiscovery } from '@/hooks/useDiscovery';
import { DiscoveryRow } from './DiscoveryRow';
import { DiscoveryModal } from './DiscoveryModal';
import { LeadMagnetPopup } from './LeadMagnetPopup';
import { QuestionsView } from './QuestionsView';
import { NewsDiscoveryTab } from './NewsDiscoveryTab';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryTabProps {
  username: string;
  influencerName: string;
  sessionId?: string;
  initialCategory?: string | null;
  onAskInChat: (message: string, enrichedData?: string) => void;
  onCategoryOpened?: () => void;
  influencerType?: string;
}

/** Max sections to show initially */
const INITIAL_VISIBLE = 5;

/** Pinterest masonry layout for all rows */

export default function DiscoveryTab({ username, influencerName, sessionId, initialCategory, onAskInChat, onCategoryOpened, influencerType }: DiscoveryTabProps) {
  // Media/News accounts get a completely different discovery layout
  if (influencerType === 'media_news') {
    return (
      <NewsDiscoveryTab
        username={username}
        influencerName={influencerName}
        onAskInChat={onAskInChat}
      />
    );
  }

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
  const [showAll, setShowAll] = useState(false);

  // Modal state
  const [selectedItem, setSelectedItem] = useState<DiscoveryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategoryTitle, setModalCategoryTitle] = useState('');
  const [modalCategoryColor, setModalCategoryColor] = useState('#7c3aed');

  // Lead magnet state
  const [showLeadMagnet, setShowLeadMagnet] = useState(false);
  const viewCountRef = useRef(0);
  const leadMagnetShownRef = useRef(false);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(`discovery_lead_magnet_${username}`);
      if (dismissed) leadMagnetShownRef.current = true;
    } catch { /* sessionStorage not available */ }
  }, [username]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

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

  const handleItemClick = useCallback((item: DiscoveryItem, categoryTitle: string, categorySlug: string) => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }

    const row = rows.find(r => r.category.slug === categorySlug);
    const color = row?.category.color || '#7c3aed';

    setSelectedItem(item);
    setModalCategoryTitle(categoryTitle);
    setModalCategoryColor(color);
    setIsModalOpen(true);

    viewCountRef.current += 1;
    if (viewCountRef.current >= 3 && !leadMagnetShownRef.current) {
      leadMagnetShownRef.current = true;
      setTimeout(() => setShowLeadMagnet(true), 600);
    }
  }, [rows]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollPositionRef.current;
      }
    });
  }, []);

  const handleModalAskInChat = useCallback((message: string, enrichedData?: string) => {
    const row = rows.find(r => r.category.title === modalCategoryTitle);
    if (row && selectedItem) {
      const contextLines = row.items.map((it, idx) => {
        const t = it.aiTitle || it.captionExcerpt || '';
        const summary = it.aiSummary || '';
        const metric = it.metricValue && it.metricLabel
          ? ` (${it.metricLabel}: ${it.metricValue.toLocaleString()})`
          : '';
        return `${idx + 1}. ${t}${metric}${summary ? ' — ' + summary : ''}`;
      }).join('\n');
      enrichedData = `[הנתונים מתוך הרשימה "${modalCategoryTitle}":\n${contextLines}]\n\n${message}`;
    }
    onAskInChat(message, enrichedData);
  }, [rows, modalCategoryTitle, selectedItem, onAskInChat]);

  const handleLeadMagnetClose = useCallback(() => {
    setShowLeadMagnet(false);
    try {
      sessionStorage.setItem(`discovery_lead_magnet_${username}`, '1');
    } catch { /* sessionStorage not available */ }
  }, [username]);

  const handleLeadMagnetSubmit = useCallback(async (name: string, email: string) => {
    try {
      await fetch('/api/discovery/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, sessionId }),
      });
    } catch { /* Non-blocking */ }
    setShowLeadMagnet(false);
    try {
      sessionStorage.setItem(`discovery_lead_magnet_${username}`, '1');
    } catch { /* sessionStorage not available */ }
  }, [username, sessionId]);

  // Determine visible rows
  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_VISIBLE);
  const hasMore = rows.length > INITIAL_VISIBLE && !showAll;

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto" style={{ backgroundColor: '#f8f9fb' }}>
      <div className="max-w-[700px] mx-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between" dir="rtl">
          <div>
            <h1 className="font-bold text-[20px] tracking-tight" style={{ color: '#191c1e' }}>
              גלו
            </h1>
            <p className="text-[13px] font-medium" style={{ color: '#444749' }}>
              הבחירות של {influencerName}
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#c4b5fd' }} />
            <p className="text-[13px]" style={{ color: '#9ca3af' }}>טוען תוכן...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px]" style={{ color: '#9ca3af' }}>{error}</p>
          </div>
        )}

        {/* Content rows */}
        {!loading && rows.length > 0 && (
          <div className="px-5 pb-4 space-y-[28px]">
            {visibleRows.map((row, idx) => (
              <DiscoveryRow
                key={row.category.slug}
                slug={row.category.slug}
                title={row.category.title}
                subtitle={row.category.subtitle}
                color={row.category.color}
                items={row.items}
                onItemClick={handleItemClick}
                layout={idx % 2 === 0 ? 'masonry' : 'scroll'}
              />
            ))}

            {/* Show more button */}
            {hasMore && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-3 rounded-2xl text-[13px] font-bold transition-colors active:scale-[0.98]"
                style={{ backgroundColor: '#f3f0ff', color: '#7c3aed' }}
                dir="rtl"
              >
                הצג עוד {rows.length - INITIAL_VISIBLE} קטגוריות
              </button>
            )}
          </div>
        )}

        {/* Empty */}
        {!loading && rows.length === 0 && !error && (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px]" style={{ color: '#9ca3af' }}>אין רשימות זמינות כרגע</p>
          </div>
        )}

        {/* Questions */}
        <div className="px-5 pt-4 mb-32">
          <button
            onClick={() => setShowQuestions(!showQuestions)}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl active:scale-[0.98] transition-all"
            style={{ border: '1px solid #f0f0f0', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
            dir="rtl"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#f3f0ff' }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#7c3aed', fontVariationSettings: "'FILL' 1" }}
                >
                  help
                </span>
              </div>
              <span className="font-bold text-[14px]" style={{ color: '#191c1e' }}>
                שאלות שתמיד רציתם לשאול
              </span>
            </div>
            <span
              className="material-symbols-outlined transition-transform"
              style={{
                color: '#75777a',
                transform: showQuestions ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              chevron_left
            </span>
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

      {/* Discovery Modal */}
      <DiscoveryModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onAskInChat={handleModalAskInChat}
        categoryTitle={modalCategoryTitle}
        categoryColor={modalCategoryColor}
      />

      {/* Lead Magnet Popup */}
      <LeadMagnetPopup
        isOpen={showLeadMagnet}
        onClose={handleLeadMagnetClose}
        onSubmit={handleLeadMagnetSubmit}
        influencerName={influencerName}
      />
    </div>
  );
}
