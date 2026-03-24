'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Search, ExternalLink, Star, Flame, ShoppingBag,
  X, Sparkles, Leaf, Users, Tag, Package,
  ChefHat, Heart,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  name: string;
  name_he?: string;
  description?: string;
  price?: number;
  original_price?: number;
  currency?: string;
  category?: string;
  subcategory?: string;
  product_line?: string;
  volume?: string;
  key_ingredients?: string[];
  benefits?: string[];
  target_audience?: string[];
  image_url?: string;
  product_url?: string;
  is_on_sale?: boolean;
  is_featured?: boolean;
  is_available?: boolean;
  ai_profile?: {
    whatItDoes?: string;
    sellingPoints?: string[];
    bestFor?: string[];
    pairsWith?: string[];
    conversationTriggers?: string[];
  };
  complementary_ids?: string[];
}

interface ProductsCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  accountType?: string; // influencer_type from chat page
}

/** Build rich hidden context string from a product so the AI model has full info */
function buildProductContext(product: Product): string {
  const ai = product.ai_profile || {};
  const parts: string[] = [];
  parts.push(`[מוצר: ${product.name_he || product.name}]`);
  if (product.name_he && product.name && product.name_he !== product.name) {
    parts.push(`[שם באנגלית: ${product.name}]`);
  }
  if (product.category) parts.push(`[קטגוריה: ${CATEGORY_LABELS[product.category] || product.category}]`);
  if (product.subcategory) parts.push(`[תת-קטגוריה: ${product.subcategory}]`);
  if (product.product_line) parts.push(`[קו מוצרים: ${product.product_line}]`);
  if (product.price != null) parts.push(`[מחיר: ₪${product.price}]`);
  if (product.original_price) parts.push(`[מחיר מקורי: ₪${product.original_price}]`);
  if (product.volume) parts.push(`[נפח/גודל: ${product.volume}]`);
  if (product.is_on_sale) parts.push(`[במבצע]`);
  if (product.is_featured) parts.push(`[מוצר מומלץ]`);
  if (ai.whatItDoes) parts.push(`[תיאור: ${ai.whatItDoes}]`);
  if (product.description && product.description !== ai.whatItDoes) parts.push(`[תיאור נוסף: ${product.description}]`);
  if (product.key_ingredients?.length) parts.push(`[מרכיבים: ${product.key_ingredients.join(', ')}]`);
  if (product.benefits?.length) parts.push(`[יתרונות: ${product.benefits.join(', ')}]`);
  if (product.target_audience?.length) parts.push(`[קהל יעד: ${product.target_audience.join(', ')}]`);
  if (ai.sellingPoints?.length) parts.push(`[נקודות מכירה: ${ai.sellingPoints.join(', ')}]`);
  if (ai.bestFor?.length) parts.push(`[מתאים ל: ${ai.bestFor.join(', ')}]`);
  if (ai.pairsWith?.length) parts.push(`[משתלב עם: ${ai.pairsWith.join(', ')}]`);
  if (product.product_url) parts.push(`[לינק לרכישה: ${product.product_url}]`);
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<string, string> = {
  hair_care: '#ec4899', face_care: '#f472b6', body_care: '#fb923c',
  makeup: '#e879f9', fragrance: '#c084fc', skincare: '#34d399',
  food: '#f59e0b', spices: '#ef4444', paint: '#3b82f6',
  tools: '#6b7280', service: '#8b5cf6', general: '#64748b',
  other: '#94a3b8',
};

const CATEGORY_LABELS: Record<string, string> = {
  hair_care: 'טיפוח שיער', face_care: 'טיפוח פנים', body_care: 'טיפוח גוף',
  makeup: 'איפור', fragrance: 'בשמים', skincare: 'טיפוח עור',
  food: 'אוכל', spices: 'תבלינים', paint: 'צבעים',
  tools: 'כלים', service: 'שירותים', general: 'כללי',
  other: 'אחר',
};

const FOOD_CATEGORIES = new Set(['food', 'spices']);
const BEAUTY_CATEGORIES = new Set(['hair_care', 'face_care', 'body_care', 'makeup', 'fragrance', 'skincare']);

function isFoodBrand(products: Product[]): boolean {
  const cats = products.map(p => p.category);
  return cats.some(c => FOOD_CATEGORIES.has(c || ''));
}

function isBeautyBrand(products: Product[]): boolean {
  const cats = products.map(p => p.category);
  return cats.some(c => BEAUTY_CATEGORIES.has(c || ''));
}

function getCategoryColor(cat?: string): string {
  return CATEGORY_COLORS[cat || 'general'] || '#6366f1';
}

/* ------------------------------------------------------------------ */
/*  Product Detail Modal                                               */
/* ------------------------------------------------------------------ */

function ProductModal({
  product, allProducts, onClose, onAskAbout, isFood, isBeauty,
}: {
  product: Product;
  allProducts: Product[];
  onClose: () => void;
  onAskAbout: (q: string) => void;
  isFood: boolean;
  isBeauty: boolean;
}) {
  const ai = product.ai_profile || {};
  const displayName = product.name_he || product.name;
  const color = getCategoryColor(product.category);

  // Find related / complementary products
  const related: Product[] = [];
  if (product.complementary_ids?.length) {
    for (const cid of product.complementary_ids) {
      const found = allProducts.find(p => p.id === cid);
      if (found) related.push(found);
    }
  }
  if (ai.pairsWith?.length && related.length < 4) {
    for (const pairName of ai.pairsWith) {
      if (related.length >= 4) break;
      const lower = pairName.toLowerCase();
      const match = allProducts.find(p =>
        p.id !== product.id &&
        !related.includes(p) &&
        ((p.name_he || p.name || '').toLowerCase().includes(lower) ||
          lower.includes((p.name_he || p.name || '').toLowerCase()))
      );
      if (match) related.push(match);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--chat-bg, #fff)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header image or gradient */}
        {product.image_url ? (
          <div className="relative h-56 overflow-hidden rounded-t-3xl sm:rounded-t-3xl">
            <img src={product.image_url} alt={displayName} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
            <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full backdrop-blur-md"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <X className="w-5 h-5 text-white" />
            </button>
            {product.price != null && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <span className="text-2xl font-bold text-white">₪{product.price}</span>
                {product.is_on_sale && product.original_price && (
                  <span className="text-sm line-through text-white/60">₪{product.original_price}</span>
                )}
              </div>
            )}
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {product.is_featured && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium backdrop-blur-sm"
                  style={{ background: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
                  <Star className="w-3 h-3" /> מומלץ
                </span>
              )}
              {product.is_on_sale && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium backdrop-blur-sm"
                  style={{ background: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
                  <Flame className="w-3 h-3" /> מבצע
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative h-28 rounded-t-3xl sm:rounded-t-3xl" style={{
            background: `linear-gradient(135deg, ${color}30, ${color}10)`,
          }}>
            <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full"
              style={{ background: 'rgba(0,0,0,0.08)' }}>
              <X className="w-5 h-5" style={{ color: 'var(--text-secondary, #6b7280)' }} />
            </button>
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {product.is_featured && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#d97706' }}>
                  <Star className="w-3 h-3" /> מומלץ
                </span>
              )}
              {product.is_on_sale && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  <Flame className="w-3 h-3" /> מבצע
                </span>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-5 pb-6 -mt-2 relative" dir="rtl">
          {/* Title + price (if no image) */}
          <div className="flex items-start justify-between gap-3 mt-4">
            <div>
              <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary, #1f2937)' }}>
                {displayName}
              </h2>
              {product.category && (
                <span className="inline-flex items-center gap-1.5 text-xs mt-1" style={{ color }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {CATEGORY_LABELS[product.category] || product.category}
                  {product.subcategory && ` · ${product.subcategory}`}
                </span>
              )}
            </div>
            {!product.image_url && product.price != null && (
              <div className="text-left shrink-0">
                <div className="text-xl font-bold" style={{ color: 'var(--color-primary, #7c3aed)' }}>₪{product.price}</div>
                {product.is_on_sale && product.original_price && (
                  <div className="text-xs line-through" style={{ color: 'var(--text-secondary, #9ca3af)' }}>₪{product.original_price}</div>
                )}
              </div>
            )}
          </div>

          {/* Volume / Product Line */}
          {(product.volume || product.product_line) && (
            <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
              {product.volume && <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {product.volume}</span>}
              {product.product_line && <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {product.product_line}</span>}
            </div>
          )}

          {/* AI description */}
          {(ai.whatItDoes || product.description) && (
            <p className="text-sm leading-relaxed mt-4" style={{ color: 'var(--text-primary, #374151)' }}>
              {ai.whatItDoes || product.description}
            </p>
          )}

          {/* Selling points */}
          {ai.sellingPoints && ai.sellingPoints.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color }} /> למה זה מיוחד
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {ai.sellingPoints.map((sp, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}>
                    {sp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key ingredients */}
          {product.key_ingredients && product.key_ingredients.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                <Leaf className="w-3.5 h-3.5 text-emerald-500" /> {isFood ? 'מרכיבים עיקריים' : 'רכיבים פעילים'}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {product.key_ingredients.map((ing, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Benefits */}
          {product.benefits && product.benefits.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                <Heart className="w-3.5 h-3.5 text-rose-400" /> יתרונות
              </h4>
              <ul className="space-y-1">
                {product.benefits.map((b, i) => (
                  <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--text-primary, #374151)' }}>
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f472b6' }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Best for / Target audience */}
          {(ai.bestFor?.length || product.target_audience?.length) && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                <Users className="w-3.5 h-3.5 text-blue-400" /> מתאים ל
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {(ai.bestFor || product.target_audience || []).map((t, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pairs with (text) */}
          {ai.pairsWith && ai.pairsWith.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                {isFood ? <ChefHat className="w-3.5 h-3.5 text-amber-500" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                {isFood ? 'משתלב יופי עם' : 'משתלב עם'}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {ai.pairsWith.map((pw, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: isFood ? 'rgba(245,158,11,0.08)' : 'rgba(168,85,247,0.08)', color: isFood ? '#d97706' : '#a855f7', border: `1px solid ${isFood ? 'rgba(245,158,11,0.2)' : 'rgba(168,85,247,0.2)'}` }}>
                    {pw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related products */}
          {related.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-semibold mb-2.5" style={{ color: 'var(--text-primary, #1f2937)' }}>
                {isBeauty ? '💄 מוצרים משלימים' : isFood ? '🍽️ מוצרים קשורים' : '📦 מוצרים קשורים'}
              </h4>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {related.map(r => (
                  <button key={r.id}
                    className="shrink-0 w-28 rounded-xl overflow-hidden text-right"
                    style={{ background: 'var(--input-bg, #f9fafb)', border: '1px solid var(--border-color, #e5e7eb)' }}
                    onClick={() => onAskAbout(`ספרו לי על ${r.name_he || r.name}`, buildProductContext(r))}>
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name_he || r.name} className="w-full h-20 object-cover" />
                    ) : (
                      <div className="h-12" style={{ background: `linear-gradient(135deg, ${getCategoryColor(r.category)}20, ${getCategoryColor(r.category)}08)` }} />
                    )}
                    <div className="p-2">
                      <div className="text-[11px] font-medium line-clamp-2" style={{ color: 'var(--text-primary, #1f2937)' }}>
                        {r.name_he || r.name}
                      </div>
                      {r.price != null && (
                        <div className="text-[10px] mt-0.5 font-semibold" style={{ color }}>₪{r.price}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ask about & buy buttons */}
          <div className="flex gap-2 mt-5">
            <button
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
              style={{ background: 'var(--color-primary, #7c3aed)', color: '#fff' }}
              onClick={() => { onAskAbout(`ספרו לי עוד על ${displayName}`, buildProductContext(product)); onClose(); }}
            >
              {isFood ? '🍳 שאלו אותי על מתכונים' : '💬 שאלו אותי על המוצר'}
            </button>
            {product.product_url && (
              <a href={product.product_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
                style={{ background: 'var(--input-bg, #f3f4f6)', color: 'var(--text-primary, #374151)' }}
                onClick={e => e.stopPropagation()}>
                <ExternalLink className="w-4 h-4" /> לרכישה
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product Card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const ai = product.ai_profile || {};
  const displayName = product.name_he || product.name;
  const color = getCategoryColor(product.category);
  const hasImage = !!product.image_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl overflow-hidden cursor-pointer transition-shadow hover:shadow-md"
      style={{
        background: 'var(--chat-bg, #fff)',
        border: product.is_featured
          ? '1.5px solid rgba(251,191,36,0.4)'
          : '1px solid var(--border-color, #e5e7eb)',
      }}
      onClick={onClick}
    >
      {/* Image area */}
      {hasImage ? (
        <div className="relative h-40 overflow-hidden">
          <img
            src={product.image_url}
            alt={displayName}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }} />
          {/* Badges */}
          <div className="absolute top-2 right-2 flex gap-1">
            {product.is_featured && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium backdrop-blur-sm"
                style={{ background: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
                <Star className="w-2.5 h-2.5" />
              </span>
            )}
            {product.is_on_sale && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium backdrop-blur-sm"
                style={{ background: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
                <Flame className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          {/* Price on image */}
          {product.price != null && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              <span className="text-base font-bold text-white">₪{product.price}</span>
              {product.is_on_sale && product.original_price && (
                <span className="text-[10px] line-through text-white/50">₪{product.original_price}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* No image — gradient header with icon */
        <div className="relative h-20 flex items-center justify-center" style={{
          background: `linear-gradient(135deg, ${color}22, ${color}0a)`,
        }}>
          <ShoppingBag className="w-8 h-8 opacity-20" style={{ color }} />
          <div className="absolute top-2 right-2 flex gap-1">
            {product.is_featured && <Star className="w-3 h-3" style={{ color: '#fbbf24' }} />}
            {product.is_on_sale && <Flame className="w-3 h-3" style={{ color: '#f87171' }} />}
          </div>
          {product.price != null && (
            <div className="absolute bottom-2 left-2">
              <span className="text-sm font-bold" style={{ color }}>₪{product.price}</span>
              {product.is_on_sale && product.original_price && (
                <span className="text-[10px] ml-1 line-through" style={{ color: 'var(--text-secondary, #9ca3af)' }}>₪{product.original_price}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-3" dir="rtl">
        <h3 className="font-semibold text-[13px] leading-tight line-clamp-2"
          style={{ color: 'var(--text-primary, #1f2937)' }}>
          {displayName}
        </h3>

        {/* Description */}
        {(ai.whatItDoes || product.description) && (
          <p className="text-[11px] mt-1.5 leading-relaxed line-clamp-2"
            style={{ color: 'var(--text-secondary, #6b7280)' }}>
            {ai.whatItDoes || product.description}
          </p>
        )}

        {/* Tags row */}
        <div className="flex flex-wrap gap-1 mt-2">
          {ai.sellingPoints?.slice(0, 2).map((sp, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}10`, color, border: `1px solid ${color}20` }}>
              {sp}
            </span>
          ))}
          {product.volume && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--input-bg, #f3f4f6)', color: 'var(--text-secondary, #9ca3af)' }}>
              {product.volume}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color, #f3f4f6)' }}>
          <span className="text-[10px]" style={{ color }}>
            {CATEGORY_LABELS[product.category || ''] || product.category?.replace(/_/g, ' ') || ''}
          </span>
          {product.product_url && (
            <a href={product.product_url} target="_blank" rel="noopener noreferrer"
              className="p-1 rounded-md transition-colors hover:bg-black/5"
              style={{ color: 'var(--text-secondary, #9ca3af)' }}
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProductsCatalogTab({ accountId, onAskAbout, accountType }: ProductsCatalogTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/influencer/content/products?accountId=${accountId}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = products.filter(p => {
    if (activeCategory && p.category !== activeCategory) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name_he || p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.ai_profile?.whatItDoes || '').toLowerCase().includes(q) ||
      (p.key_ingredients || []).some(ing => ing.toLowerCase().includes(q));
  });

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];

  // Group by product_line
  const grouped = new Map<string, Product[]>();
  const noLine: Product[] = [];
  for (const p of filtered) {
    if (p.product_line) {
      if (!grouped.has(p.product_line)) grouped.set(p.product_line, []);
      grouped.get(p.product_line)!.push(p);
    } else {
      noLine.push(p);
    }
  }
  const sortedGroups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  const showGrouped = sortedGroups.length > 1 || (sortedGroups.length === 1 && noLine.length > 0);

  const food = isFoodBrand(products);
  const beauty = isBeautyBrand(products);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary, #7c3aed)' }} />
      </div>
    );
  }

  const renderSection = (title: string, items: Product[], accent?: string) => (
    <div className="mb-6" key={title}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-1 h-5 rounded-full" style={{ background: accent || 'var(--color-primary, #7c3aed)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary, #1f2937)' }}>{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--border-color, #f3f4f6)', color: 'var(--text-secondary, #9ca3af)' }}>
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(p => (
          <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={scrollRef}
        className="px-3 py-4 overflow-y-auto"
        dir="rtl"
        style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-5 h-5" style={{ color: 'var(--color-primary, #7c3aed)' }} />
          <h2 className="font-bold text-base" style={{ color: 'var(--text-primary, #1f2937)' }}>
            קטלוג מוצרים
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-primary-10, rgba(124,58,237,0.08))', color: 'var(--color-primary, #7c3aed)' }}>
            {products.length}
          </span>
        </div>

        {/* Search */}
        {products.length > 6 && (
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary, #9ca3af)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי שם, תיאור או מרכיב..."
              className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--input-bg, #f9fafb)',
                color: 'var(--text-primary, #1f2937)',
                border: '1px solid var(--border-color, #e5e7eb)',
              }}
            />
          </div>
        )}

        {/* Category pills */}
        {categories.length > 1 && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveCategory(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all"
              style={{
                background: !activeCategory ? 'var(--color-primary, #7c3aed)' : 'var(--input-bg, #f3f4f6)',
                color: !activeCategory ? '#fff' : 'var(--text-secondary, #6b7280)',
              }}
            >
              <ShoppingBag className="w-3 h-3" />
              הכל
            </button>
            {categories.map(cat => {
              const color = CATEGORY_COLORS[cat] || '#64748b';
              const isActive = activeCategory === cat;
              const count = products.filter(p => p.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? null : cat)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all"
                  style={{
                    background: isActive ? `${color}18` : 'var(--input-bg, #f3f4f6)',
                    color: isActive ? color : 'var(--text-secondary, #6b7280)',
                    border: isActive ? `1px solid ${color}30` : '1px solid transparent',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')}
                  <span className="text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Featured carousel */}
        {!searchQuery && !activeCategory && products.some(p => p.is_featured) && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold mb-2 px-1 flex items-center gap-1.5"
              style={{ color: 'var(--text-primary, #1f2937)' }}>
              <Star className="w-3.5 h-3.5 text-amber-400" /> מומלצים
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {products.filter(p => p.is_featured).map(p => (
                <div key={p.id} className="shrink-0 w-44">
                  <ProductCard product={p} onClick={() => setSelectedProduct(p)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-secondary, #d1d5db)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
              {searchQuery ? 'לא נמצאו מוצרים' : 'אין מוצרים עדיין'}
            </p>
          </div>
        ) : showGrouped ? (
          <>
            {sortedGroups.map(([lineName, items]) => renderSection(lineName, items))}
            {noLine.length > 0 && renderSection('מוצרים נוספים', noLine, 'var(--text-secondary, #9ca3af)')}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
            ))}
          </div>
        )}

        {/* Bottom padding for safe area */}
        <div className="h-6" />
      </div>

      {/* Product detail modal */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            allProducts={products}
            onClose={() => setSelectedProduct(null)}
            onAskAbout={onAskAbout}
            isFood={food}
            isBeauty={beauty}
          />
        )}
      </AnimatePresence>
    </>
  );
}
