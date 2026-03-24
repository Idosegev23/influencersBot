'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';
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
  const [videoError, setVideoError] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const isReel = item?.mediaType === 'reel' || item?.mediaType === 'video';
  const hasPlayableVideo = isReel && !!item?.videoUrl && !videoError;

  // Set portal target on mount
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

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
      setIsVideoPlaying(false);
      setVideoError(false);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Autoplay video when modal opens with a reel
  useEffect(() => {
    if (isOpen && hasPlayableVideo && videoRef.current) {
      const timer = setTimeout(() => {
        videoRef.current?.play().then(() => {
          setIsVideoPlaying(true);
        }).catch(() => { /* autoplay blocked by browser */ });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hasPlayableVideo]);

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

  if (!item || !portalTarget) return null;

  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const displayTitle = item.aiTitle || item.captionExcerpt;
  const metricText = item.metricValue != null && item.metricLabel
    ? formatMetricLabel(item.metricValue, item.metricLabel)
    : null;

  const modalContent = (
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
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: 'rgba(25, 28, 30, 0.4)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal — compact, no scroll */}
          <motion.div
            className="relative w-full max-w-[400px] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
            initial={{ scale: 0.92, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            dir="rtl"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Media area — compact */}
            <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
              {hasPlayableVideo ? (
                <>
                  {!isVideoPlaying && thumbnailSrc && (
                    <div className="absolute inset-0 z-10">
                      <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={handlePlayVideo}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        </div>
                      </button>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    src={item.videoUrl}
                    className="w-full h-full object-cover"
                    muted={isMuted}
                    loop
                    playsInline
                    onPlay={() => setIsVideoPlaying(true)}
                    onError={() => setVideoError(true)}
                  />
                  {isVideoPlaying && (
                    <div className="absolute bottom-3 left-3 z-20">
                      <button
                        onClick={toggleMute}
                        className="bg-black/30 backdrop-blur-md p-1.5 rounded-full text-white"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isMuted ? 'volume_off' : 'volume_up'}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              ) : thumbnailSrc ? (
                <div className="relative w-full h-full">
                  <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                  {isReel && (
                    <button
                      onClick={handleOpenPost}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#e7e8ea' }}>
                  <Eye className="w-8 h-8 opacity-15" />
                </div>
              )}

              {/* Overlay: metric badge + category */}
              <div className="absolute bottom-0 inset-x-0 card-gradient pt-12 pb-3 px-4">
                <div className="flex items-center gap-2">
                  {metricText && (
                    <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                      {metricText}
                    </span>
                  )}
                  {categoryTitle && (
                    <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                      {categoryTitle}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Content — compact, no scroll */}
            <div className="p-5">
              {/* Title */}
              <h2 className="text-[17px] font-black leading-tight mb-2" style={{ color: '#191c1e' }}>
                {displayTitle}
              </h2>

              {/* AI Summary — 2 lines max */}
              {item.aiSummary && (
                <p className="text-[13px] leading-relaxed line-clamp-3 mb-4" style={{ color: '#4a4455' }}>
                  {item.aiSummary}
                </p>
              )}

              {/* Action Buttons — side by side */}
              <div className="flex gap-2.5">
                <button
                  onClick={handleAskInChat}
                  className="flex-1 font-bold h-11 rounded-xl flex items-center justify-center gap-1.5 text-white text-[13px] active:scale-[0.98] transition-all"
                  style={{
                    background: 'linear-gradient(to left, #630ed4, #7c3aed)',
                    boxShadow: '0 6px 20px -6px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">forum</span>
                  <span>שאל את ה-AI</span>
                </button>

                <button
                  onClick={handleOpenPost}
                  className="flex-1 font-bold h-11 rounded-xl flex items-center justify-center gap-1.5 text-[13px] active:scale-[0.98] transition-all"
                  style={{
                    color: '#630ed4',
                    border: '1px solid #ccc3d8',
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>באינסטגרם</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, portalTarget);
}

function formatMetricLabel(value: number, label: string): string {
  const formatted = value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}K`
      : value.toLocaleString('he-IL');
  return `${formatted} ${label}`;
}
