'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Volume2, VolumeX, ExternalLink, MessageCircle } from 'lucide-react';
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
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full sm:max-w-[420px] max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            initial={{ scale: 0.92, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            dir="rtl"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 left-3 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Media area */}
            <div className="relative w-full" style={{ aspectRatio: isReel ? '9/16' : '1/1', maxHeight: '55vh' }}>
              {isReel && item.postUrl ? (
                <>
                  {!isVideoPlaying && thumbnailSrc && (
                    <div className="absolute inset-0 z-10">
                      <img
                        src={thumbnailSrc}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={handlePlayVideo}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <Play className="w-8 h-8 text-white fill-white ml-1" />
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
                  {isVideoPlaying && (
                    <button
                      onClick={toggleMute}
                      className="absolute bottom-3 left-3 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      {isMuted
                        ? <VolumeX className="w-4 h-4 text-white" />
                        : <Volume2 className="w-4 h-4 text-white" />
                      }
                    </button>
                  )}
                </>
              ) : thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${categoryColor}30, ${categoryColor}10)` }}
                >
                  <span className="text-5xl opacity-25">📷</span>
                </div>
              )}

              {/* Gradient overlay at bottom of media */}
              <div
                className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
                style={{ background: 'linear-gradient(to top, white, transparent)' }}
              />

              {/* Rank badge */}
              <div
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shadow-lg"
                style={{ backgroundColor: categoryColor }}
              >
                {item.rank}
              </div>
            </div>

            {/* Content area */}
            <div className="px-5 pb-5 pt-1 flex flex-col gap-3 overflow-y-auto flex-1">
              {/* Title */}
              <h3 className="text-[18px] font-bold leading-snug" style={{ color: '#0c1013' }}>
                {displayTitle}
              </h3>

              {/* Metric pill */}
              {item.metricValue != null && item.metricLabel && (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-bold text-white"
                    style={{ backgroundColor: categoryColor }}
                  >
                    {formatMetric(item.metricValue)} {item.metricLabel}
                  </span>
                  {categoryTitle && (
                    <span className="text-[12px]" style={{ color: '#999' }}>
                      {categoryTitle}
                    </span>
                  )}
                </div>
              )}

              {/* AI Summary */}
              {item.aiSummary && (
                <p className="text-[14px] leading-relaxed" style={{ color: '#4a4a4a' }}>
                  {item.aiSummary}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2.5 mt-2">
                <button
                  onClick={handleAskInChat}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  <MessageCircle className="w-5 h-5" />
                  שוחח על זה עם ה-AI
                </button>

                <button
                  onClick={handleOpenPost}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[14px] font-semibold transition-all hover:bg-gray-100 active:scale-[0.98]"
                  style={{ color: '#676767', border: '1px solid #e5e5ea' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  לפוסט באינסטגרם
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
