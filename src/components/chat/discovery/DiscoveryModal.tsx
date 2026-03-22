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
  const [videoError, setVideoError] = useState(false);

  const isReel = item?.mediaType === 'reel' || item?.mediaType === 'video';
  const hasPlayableVideo = isReel && !!item?.videoUrl && !videoError;

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

  if (!item) return null;

  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const displayTitle = item.aiTitle || item.captionExcerpt;
  const postedAtLabel = formatPostedAt((item as any).postedAt);

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
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            {/* Media area */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/5', maxHeight: '55vh' }}>
              {hasPlayableVideo ? (
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
                    src={item.videoUrl}
                    className="w-full h-full object-cover"
                    muted={isMuted}
                    loop
                    playsInline
                    onPlay={() => setIsVideoPlaying(true)}
                    onError={() => setVideoError(true)}
                  />
                  {/* Mute/Unmute */}
                  {isVideoPlaying && (
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
                      <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: '#e7e8ea' }}
                >
                  <span className="text-5xl opacity-25">📷</span>
                </div>
              )}

              {/* AI Badge overlay */}
              <div
                className="absolute top-4 left-4 z-10 text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-lg text-white"
                style={{ backgroundColor: 'rgba(124, 58, 237, 0.9)' }}
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span>ניתוח AI</span>
              </div>
            </div>

            {/* Content Details */}
            <div className="p-6 pb-10 flex flex-col gap-6 overflow-y-auto flex-1">
              {/* Title & Published time & Summary */}
              <div className="flex flex-col gap-3">
                <h2 className="text-[20px] font-black font-headline leading-tight tracking-tight" style={{ color: '#191c1e' }}>
                  {displayTitle}
                </h2>

                {/* Published time indicator */}
                {postedAtLabel && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7c3aed' }} />
                    <span className="text-[12px] font-medium" style={{ color: '#4a4455' }}>
                      {postedAtLabel}
                    </span>
                  </div>
                )}

                {/* AI Summary card */}
                {item.aiSummary && (
                  <div
                    className="bg-[#edeef0] rounded-2xl p-4 border-r-4"
                    style={{ borderColor: 'rgba(99, 14, 212, 0.4)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                      >
                        summarize
                      </span>
                      <span className="text-[12px] font-bold" style={{ color: '#630ed4' }}>
                        תקציר חכם
                      </span>
                    </div>
                    <p className="text-[14px] leading-relaxed" style={{ color: '#4a4455' }}>
                      {item.aiSummary}
                    </p>
                  </div>
                )}
              </div>

              {/* Bento-style Insights */}
              {(item.metricValue != null || categoryTitle) && (
                <div className="grid grid-cols-2 gap-3">
                  {item.metricValue != null && item.metricLabel && (
                    <div className="p-4 rounded-xl flex flex-col items-center gap-1.5" style={{ backgroundColor: '#f3f4f6' }}>
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                      >
                        trending_up
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: '#4a4455' }}>{item.metricLabel}</span>
                      <span className="text-[18px] font-black" style={{ color: '#630ed4' }}>
                        {formatMetric(item.metricValue)}
                      </span>
                    </div>
                  )}
                  {categoryTitle && (
                    <div className="p-4 rounded-xl flex flex-col items-center gap-1.5" style={{ backgroundColor: '#f3f4f6' }}>
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                      >
                        category
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: '#4a4455' }}>קטגוריה</span>
                      <span className="text-[18px] font-black" style={{ color: '#191c1e' }}>{categoryTitle}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleAskInChat}
                  className="w-full font-bold h-14 rounded-xl flex items-center justify-center gap-2 text-white active:scale-[0.98] transition-all hover:brightness-110"
                  style={{
                    background: 'linear-gradient(to left, #630ed4, #7c3aed)',
                    boxShadow: '0 10px 30px -10px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">forum</span>
                  <span>שוחח על זה עם ה-AI</span>
                </button>

                <button
                  onClick={handleOpenPost}
                  className="w-full font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  style={{
                    color: '#630ed4',
                    border: '1px solid #ccc3d8',
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

function formatPostedAt(postedAt: string | undefined | null): string | null {
  if (!postedAt) return null;
  try {
    const posted = new Date(postedAt);
    const now = new Date();
    const diffMs = now.getTime() - posted.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 60) return `פורסם לפני ${diffMins} דקות`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `פורסם לפני ${diffHours === 1 ? 'שעה' : diffHours === 2 ? 'שעתיים' : `${diffHours} שעות`}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'פורסם אתמול';
    if (diffDays < 7) return `פורסם לפני ${diffDays} ימים`;
    if (diffDays < 30) return `פורסם לפני ${Math.floor(diffDays / 7)} שבועות`;
    return `פורסם לפני ${Math.floor(diffDays / 30)} חודשים`;
  } catch {
    return null;
  }
}
