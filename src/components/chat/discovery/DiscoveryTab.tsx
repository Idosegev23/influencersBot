'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useDiscoveryAll } from '@/hooks/useDiscoveryAll';
import { useDiscovery } from '@/hooks/useDiscovery';
import { DiscoveryRow } from './DiscoveryRow';
import { DiscoveryModal } from './DiscoveryModal';
import { LeadMagnetPopup } from './LeadMagnetPopup';
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

  // Modal state
  const [selectedItem, setSelectedItem] = useState<DiscoveryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategoryTitle, setModalCategoryTitle] = useState('');
  const [modalCategoryColor, setModalCategoryColor] = useState('#7c3aed');

  // Lead magnet state
  const [showLeadMagnet, setShowLeadMagnet] = useState(false);
  const viewCountRef = useRef(0);
  const leadMagnetShownRef = useRef(false);

  // Check if lead magnet was already dismissed this session
  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(`discovery_lead_magnet_${username}`);
      if (dismissed) leadMagnetShownRef.current = true;
    } catch { /* sessionStorage not available */ }
  }, [username]);

  // Preserve scroll position
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
    // Save scroll position
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }

    // Find category color
    const row = rows.find(r => r.category.slug === categorySlug);
    const color = row?.category.color || '#7c3aed';

    setSelectedItem(item);
    setModalCategoryTitle(categoryTitle);
    setModalCategoryColor(color);
    setIsModalOpen(true);

    // Track views for lead magnet
    viewCountRef.current += 1;
    if (viewCountRef.current >= 3 && !leadMagnetShownRef.current) {
      leadMagnetShownRef.current = true;
      // Show lead magnet after a brief delay so modal opens first
      setTimeout(() => setShowLeadMagnet(true), 600);
    }
  }, [rows]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    // Restore scroll position
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollPositionRef.current;
      }
    });
  }, []);

  const handleModalAskInChat = useCallback((message: string, enrichedData?: string) => {
    // Build richer enriched data with category context
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
    // Save lead to Supabase via API
    try {
      await fetch('/api/discovery/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, sessionId }),
      });
    } catch {
      // Non-blocking — don't fail the UX
    }
    setShowLeadMagnet(false);
    try {
      sessionStorage.setItem(`discovery_lead_magnet_${username}`, '1');
    } catch { /* sessionStorage not available */ }
  }, [username, sessionId]);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto" style={{ backgroundColor: '#f8f9fb' }}>
      {/* Header — per Stitch: sticky top bar style */}
      <div className="px-6 pt-5 pb-3" dir="rtl">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="material-symbols-outlined text-2xl"
            style={{ color: '#6d28d9', fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#6d28d9' }}>
            גלה תוכן
          </h1>
        </div>
        <p className="text-[13px] font-medium" style={{ color: '#4a4455' }}>
          הבחירות של {influencerName}
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

      {/* Marquee rows */}
      {!loading && rows.length > 0 && (
        <div className="pt-1 pb-4">
          {rows.map((row, idx) => {
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
