'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryModalProps {
  item: DiscoveryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAskInChat: (message: string, enrichedData?: string) => void;
  categoryTitle?: string;
  categoryColor?: string;
}

export function DiscoveryModal({
  item,
  isOpen,
  onClose,
  onAskInChat,
  categoryTitle,
  categoryColor = '#7c3aed',
}: DiscoveryModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const isReel = item?.mediaType === 'reel' || item?.mediaType === 'video';

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleAskInChat = useCallback(() => {
    if (!item) return;
    const title = item.aiTitle || item.captionExcerpt;
    const truncated = title.length > 80 ? title.slice(0, 80) + '...' : title;
    const visibleMsg = `ספרי לי עוד על: ${truncated}`;

    const summaryPart = item.aiSummary ? `\nסיכום: ${item.aiSummary}` : '';
    const metricPart = item.metricValue && item.metricLabel
      ? `\n${item.metricLabel}: ${item.metricValue.toLocaleString()}`
      : '';
    const enrichedData = `[תוכן מ"${categoryTitle || 'גלו תוכן'}"${metricPart}${summaryPart}]\n\nספרי לי עוד על: ${truncated}`;

    onAskInChat(visibleMsg, enrichedData);
    onClose();
  }, [item, categoryTitle, onAskInChat, onClose]);

  const handleOpenPost = useCallback(() => {
    if (item?.postUrl) {
      window.open(item.postUrl, '_blank', 'noopener,noreferrer');
    } else if (item?.shortcode) {
      window.open(`https://www.instagram.com/p/${item.shortcode}/`, '_blank', 'noopener,noreferrer');
    }
  }, [item]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handlePlayVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsVideoPlaying(true);
    }
  }, []);

  if (!item) return null;

  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const displayTitle = item.aiTitle || item.captionExcerpt;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop — matches Stitch: bg-on-surface/40 backdrop-blur-md */}
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: 'rgba(25, 28, 30, 0.4)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-[420px] max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            initial={{ scale: 0.92, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            dir="rtl"
          >
            {/* Close button — top right for RTL */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            {/* Media area — 4:5 aspect per Stitch */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/5', maxHeight: '55vh' }}>
              {isReel && item.postUrl ? (
                <>
                  {!isVideoPlaying && thumbnailSrc && (
                    <div className="absolute inset-0 z-10">
                      <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={handlePlayVideo}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        </div>
                      </button>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    src={item.postUrl}
                    className="w-full h-full object-cover"
                    muted={isMuted}
                    loop
                    playsInline
                    onPlay={() => setIsVideoPlaying(true)}
                  />
                  {/* Mute/Unmute — bottom left per Stitch */}
                  <div className="absolute bottom-4 left-4 flex gap-2 z-20">
                    <button
                      onClick={toggleMute}
                      className="bg-black/30 backdrop-blur-md p-2 rounded-full text-white cursor-pointer hover:bg-black/50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isMuted ? 'volume_off' : 'volume_up'}
                      </span>
                    </button>
                  </div>
                </>
              ) : thumbnailSrc ? (
                <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: '#e7e8ea' }}
                >
                  <span className="text-5xl opacity-25">📷</span>
                </div>
              )}

              {/* AI Badge overlay — top left per Stitch */}
              <div
                className="absolute top-4 left-4 z-10 text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-lg text-white"
                style={{ backgroundColor: 'rgba(124, 58, 237, 0.9)' }}
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span>ניתוח AI</span>
              </div>
            </div>

            {/* Content Details — p-6 pb-10 space-y-6 per Stitch */}
            <div className="p-6 pb-10 flex flex-col gap-6 overflow-y-auto flex-1">
              {/* Title & Summary */}
              <div className="flex flex-col gap-3">
                <h2 className="text-[20px] font-extrabold leading-tight tracking-tight" style={{ color: '#191c1e' }}>
                  {displayTitle}
                </h2>
                {item.aiSummary && (
                  <p className="text-[14px] leading-relaxed" style={{ color: '#4a4455' }}>
                    {item.aiSummary}
                  </p>
                )}
              </div>

              {/* Bento-style Insights — 2-col grid per Stitch */}
              {(item.metricValue != null || categoryTitle) && (
                <div className="grid grid-cols-2 gap-3">
                  {item.metricValue != null && item.metricLabel && (
                    <div className="p-4 rounded-xl flex flex-col gap-1" style={{ backgroundColor: '#f3f4f6' }}>
                      <span className="text-[11px] font-medium" style={{ color: '#4a4455' }}>{item.metricLabel}</span>
                      <span className="text-[16px] font-bold" style={{ color: '#630ed4' }}>
                        {formatMetric(item.metricValue)}
                      </span>
                    </div>
                  )}
                  {categoryTitle && (
                    <div className="p-4 rounded-xl flex flex-col gap-1" style={{ backgroundColor: '#f3f4f6' }}>
                      <span className="text-[11px] font-medium" style={{ color: '#4a4455' }}>קטגוריה</span>
                      <span className="text-[16px] font-bold" style={{ color: '#191c1e' }}>{categoryTitle}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons — per Stitch design */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleAskInChat}
                  className="w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-white active:scale-[0.98] transition-all hover:brightness-110"
                  style={{
                    backgroundColor: '#7c3aed',
                    boxShadow: '0 10px 30px -10px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">forum</span>
                  <span>שוחח על זה עם ה-AI</span>
                </button>

                <button
                  onClick={handleOpenPost}
                  className="w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  style={{
                    color: '#191c1e',
                    border: '2px solid rgba(204, 195, 216, 0.3)',
                    backgroundColor: 'transparent',
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                  <span>לפוסט באינסטגרם</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatMetric(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('he-IL');
}
