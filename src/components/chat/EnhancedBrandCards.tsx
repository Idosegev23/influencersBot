'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Gift, Sparkles } from 'lucide-react';

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

  const handleCardTap = (brand: BrandCardData) => {
    if (brand.coupon_code) {
      navigator.clipboard.writeText(brand.coupon_code);
      setCopiedId(brand.id);
      setTimeout(() => setCopiedId(null), 2000);
      onCopy(brand);
    } else if (brand.link) {
      onOpen(brand);
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

      <div className="grid grid-cols-2 gap-2.5">
        {displayBrands.map((brand, index) => {
          const colors = getColors(brand.category);
          const isCopied = copiedId === brand.id;

          return (
            <motion.button
              key={brand.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.2 }}
              onClick={() => handleCardTap(brand)}
              className={`
                relative overflow-hidden rounded-xl border ${colors.border}
                ${colors.bg} p-3 transition-all duration-200 text-right
                hover:shadow-md active:scale-[0.98]
              `}
            >
              {/* Discount badge */}
              {brand.discount_percent && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-lg">
                  {brand.discount_percent}%
                </div>
              )}

              {/* Brand name */}
              <h4 className={`font-bold text-sm ${colors.text} truncate`}>
                {brand.brand_name}
              </h4>

              {/* Coupon code — tap to copy */}
              {brand.coupon_code && (
                <div className="mt-2 flex items-center gap-1.5">
                  {isCopied ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <Check className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">הועתק!</span>
                    </div>
                  ) : (
                    <>
                      <Gift className="w-3 h-3 text-gray-400" />
                      <code className="font-mono font-bold text-xs tracking-wide">
                        {brand.coupon_code}
                      </code>
                    </>
                  )}
                </div>
              )}

              {/* No coupon — show link hint */}
              {!brand.coupon_code && brand.link && (
                <p className="text-[10px] text-gray-400 mt-1">לחץ לאתר</p>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Show more */}
      {hasMore && !showAll && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => setShowAll(true)}
          className="w-full mt-3 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded-lg transition-all"
        >
          עוד {brands.length - maxDisplay} מותגים
        </motion.button>
      )}
    </div>
  );
}
