'use client';

import { motion } from 'framer-motion';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface PrivateCollectionProps {
  items: DiscoveryItem[];
  onUnlockClick: () => void;
}

export function PrivateCollection({ items, onUnlockClick }: PrivateCollectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="px-6 pt-8 pb-4" dir="rtl">
      {/* Header — per Stitch */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-xl"
            style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
          >
            lock
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: '#191c1e' }}>
            האוסף הפרטי
          </h2>
        </div>
        <span
          className="text-xs font-bold px-3 py-1 rounded-full"
          style={{ color: '#630ed4', backgroundColor: 'rgba(99, 14, 212, 0.1)' }}
        >
          {items.length} פריטים חדשים
        </span>
      </div>
      <p className="text-sm leading-relaxed mb-6" style={{ color: '#4a4455', maxWidth: '85%' }}>
        תוכן בלעדי לחברי מועדון ה-VIP בלבד. הצטרף עכשיו כדי לפתוח את כל הגלריה.
      </p>

      {/* Bento Grid — per Stitch */}
      <div className="grid grid-cols-2 gap-4">
        {items.map((item, idx) => {
          const thumbnailSrc = item.thumbnailUrl
            ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
            : item.shortcode
              ? getProxiedImageByShortcode(item.shortcode)
              : null;

          // First item is full width (col-span-2, 16:10)
          const isFirst = idx === 0;
          // Last item before CTA is also full width horizontal
          const isHorizontal = idx === items.length - 1 && items.length > 2;

          return (
            <motion.button
              key={item.postId || item.shortcode || `private-${idx}`}
              onClick={onUnlockClick}
              className={`relative overflow-hidden rounded-xl bg-white shadow-sm active:scale-[0.98] transition-all duration-300 cursor-pointer ${
                isFirst ? 'col-span-2' : isHorizontal ? 'col-span-2 h-32' : ''
              }`}
              style={isFirst ? { aspectRatio: '16/10' } : !isHorizontal ? { aspectRatio: '1/1' } : undefined}
              whileHover={{ scale: 0.99 }}
            >
              {/* Blurred thumbnail */}
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt=""
                  className="w-full h-full object-cover opacity-80"
                  style={{ filter: 'blur(12px)', transform: 'scale(1.1)' }}
                  loading="lazy"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(135deg, rgba(99,14,212,0.15), rgba(124,58,237,0.08))`,
                    filter: 'blur(12px)',
                  }}
                />
              )}

              {/* Lock overlay */}
              <div className={`absolute inset-0 flex ${isFirst ? 'flex-col' : ''} items-center justify-center`}
                style={{ backgroundColor: isFirst ? 'rgba(0,0,0,0.05)' : undefined }}
              >
                {isFirst ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow-xl mb-3">
                      <span
                        className="material-symbols-outlined text-3xl"
                        style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                      >
                        lock
                      </span>
                    </div>
                    <span
                      className="text-white font-bold text-sm tracking-widest uppercase px-4 py-1.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      תוכן בלעדי
                    </span>
                  </>
                ) : isHorizontal ? (
                  <div className="flex items-center justify-between w-full px-6" style={{ backgroundColor: 'rgba(99,14,212,0.1)' }}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg">
                        <span
                          className="material-symbols-outlined"
                          style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                        >
                          lock
                        </span>
                      </div>
                      <span className="text-white font-bold text-lg">
                        {item.aiTitle || item.captionExcerpt || 'תוכן נעול'}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-white/70">chevron_left</span>
                  </div>
                ) : (
                  <>
                    <span
                      className="material-symbols-outlined text-white text-3xl drop-shadow-lg"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      lock
                    </span>
                    <div className="absolute bottom-3 right-3">
                      <span
                        className="text-[10px] font-bold text-white/90 px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(99,14,212,0.4)', backdropFilter: 'blur(8px)' }}
                      >
                        #{String(item.rank || idx + 6).padStart(2, '0')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.button>
          );
        })}

        {/* Premium CTA button — full width per Stitch */}
        <div className="col-span-2 mt-4">
          <button
            onClick={onUnlockClick}
            className="w-full text-white py-5 px-6 rounded-xl flex items-center justify-between active:scale-[0.96] transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #630ed4 0%, #7c3aed 100%)',
              boxShadow: '0 10px 30px -10px rgba(99, 14, 212, 0.4)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <div className="text-right">
                <p className="text-xs opacity-80 font-medium">הצטרף ל-Premium</p>
                <p className="font-bold text-base leading-none">פתח את כל האוסף</p>
              </div>
            </div>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </div>
      </div>

      {/* Teaser text per Stitch */}
      <div className="py-12 text-center">
        <p className="text-sm font-medium" style={{ color: 'rgba(74, 68, 85, 0.6)' }}>
          רוצה לראות עוד? תמונות וסרטונים מחכים לך בפנים.
        </p>
      </div>
    </section>
  );
}
