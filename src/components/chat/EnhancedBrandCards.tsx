'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ExternalLink, HeadphonesIcon, Gift, Sparkles } from 'lucide-react';

export interface BrandCardData {
  id: string;
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  category: string | null;
  link?: string | null;
  discount_percent?: number | null;
  is_active?: boolean;
}

interface EnhancedBrandCardsProps {
  brands: BrandCardData[];
  onCopy: (brand: BrandCardData) => void;
  onOpen: (brand: BrandCardData) => void;
  onSupport: (brand: BrandCardData) => void;
  maxDisplay?: number;
}

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  food: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  fashion: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  beauty: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  tech: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  home: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  health: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  kids: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  default: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

export function EnhancedBrandCards({
  brands,
  onCopy,
  onOpen,
  onSupport,
  maxDisplay = 6,
}: EnhancedBrandCardsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayBrands = showAll ? brands : brands.slice(0, maxDisplay);
  const hasMore = brands.length > maxDisplay;

  const handleCopy = (brand: BrandCardData) => {
    if (brand.coupon_code) {
      navigator.clipboard.writeText(brand.coupon_code);
      setCopiedId(brand.id);
      setTimeout(() => setCopiedId(null), 2000);
      onCopy(brand);
    }
  };

  const getColors = (category: string | null) => {
    const cat = category?.toLowerCase() || 'default';
    return categoryColors[cat] || categoryColors.default;
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-sm font-medium text-gray-700">קופונים והטבות</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {displayBrands.map((brand, index) => {
          const colors = getColors(brand.category);
          const isCopied = copiedId === brand.id;

          return (
            <motion.div
              key={brand.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.2 }}
              className={`
                relative overflow-hidden rounded-xl border-2 ${colors.border}
                ${colors.bg} p-4 transition-all duration-200
                hover:shadow-lg hover:scale-[1.02] group
              `}
            >
              {/* Discount badge */}
              {brand.discount_percent && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-lg">
                  {brand.discount_percent}% הנחה
                </div>
              )}

              {/* Brand info */}
              <div className="mb-3">
                <h4 className={`font-bold text-base ${colors.text}`}>
                  {brand.brand_name}
                </h4>
                {brand.description && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {brand.description}
                  </p>
                )}
              </div>

              {/* Coupon code */}
              {brand.coupon_code && (
                <div className="mb-3 bg-white/60 rounded-lg p-2 border border-white/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs text-gray-500">קוד קופון:</span>
                    </div>
                    <code className="font-mono font-bold text-sm tracking-wide">
                      {brand.coupon_code}
                    </code>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {brand.coupon_code && (
                  <button
                    onClick={() => handleCopy(brand)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 py-2 px-3 
                      rounded-lg font-medium text-sm transition-all
                      ${isCopied 
                        ? 'bg-green-500 text-white' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
                      }
                    `}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>הועתק!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>העתק</span>
                      </>
                    )}
                  </button>
                )}

                {brand.link && (
                  <button
                    onClick={() => onOpen(brand)}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:opacity-90 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>לאתר</span>
                  </button>
                )}

                <button
                  onClick={() => onSupport(brand)}
                  className="flex items-center justify-center p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all"
                  title="בעיה עם הזמנה?"
                >
                  <HeadphonesIcon className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Show more button */}
      {hasMore && !showAll && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => setShowAll(true)}
          className="w-full mt-3 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded-lg transition-all"
        >
          הצג עוד {brands.length - maxDisplay} מותגים
        </motion.button>
      )}
    </div>
  );
}

