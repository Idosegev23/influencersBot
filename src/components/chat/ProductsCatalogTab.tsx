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
  onAskAbout: (q: string, hiddenContext?: string) => void;
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
/*  Card primitives                                                    */
/* ------------------------------------------------------------------ */

/** Shared image + overlay card used everywhere */
function PinCard({ product, onClick, aspect = '4/5', className = '' }: {
  product: Product; onClick: () => void; aspect?: string; className?: string;
}) {
  const displayName = product.name_he || product.name;
  const color = getCategoryColor(product.category);
  const hasImage = !!product.image_url;

  return (
    <button
      className={`relative w-full rounded-2xl overflow-hidden active:scale-[0.97] transition-transform ${className}`}
      style={{ aspectRatio: aspect, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
      onClick={onClick}
    >
      {hasImage ? (
        <img src={product.image_url} alt={displayName}
          className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0" style={{
          background: `linear-gradient(160deg, ${color}28 0%, ${color}0a 60%, var(--chat-bg, #fafafa) 100%)`,
        }}>
          <ShoppingBag className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 opacity-[0.08]"
            style={{ color }} />
        </div>
      )}
      {/* gradient overlay */}
      <div className="absolute inset-0"
        style={{ background: hasImage
          ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 70%)'
          : 'linear-gradient(to top, rgba(0,0,0,0.05) 0%, transparent 50%)' }} />
      {/* badges */}
      {(product.is_featured || product.is_on_sale) && (
        <div className="absolute top-2 right-2 flex gap-1">
          {product.is_on_sale && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md"
              style={{ background: 'rgba(239,68,68,0.35)', color: '#fff' }}>SALE</span>
          )}
          {product.is_featured && (
            <Star className="w-3.5 h-3.5 drop-shadow-lg" style={{ color: '#fbbf24' }} />
          )}
        </div>
      )}
      {/* bottom text */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5" dir="rtl">
        <h3 className="font-bold text-[12px] leading-snug line-clamp-2"
          style={{ color: hasImage ? '#fff' : 'var(--text-primary, #1f2937)',
            textShadow: hasImage ? '0 1px 4px rgba(0,0,0,0.5)' : 'none' }}>
          {displayName}
        </h3>
        {product.price != null && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-bold text-[11px]"
              style={{ color: hasImage ? '#fff' : 'var(--color-primary, #7c3aed)' }}>
              ₪{product.price}
            </span>
            {product.is_on_sale && product.original_price && (
              <span className="text-[9px] line-through"
                style={{ color: hasImage ? 'rgba(255,255,255,0.5)' : 'var(--text-secondary,#9ca3af)' }}>
                ₪{product.original_price}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/** Hero card — near full-screen, one product at a time feel */
function HeroCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const ai = product.ai_profile || {};
  const displayName = product.name_he || product.name;
  const color = getCategoryColor(product.category);
  const hasImage = !!product.image_url;

  return (
    <button
      className="relative w-full rounded-3xl overflow-hidden active:scale-[0.98] transition-transform"
      style={{ aspectRatio: '3 / 4', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
      onClick={onClick}
    >
      {hasImage ? (
        <img src={product.image_url} alt={displayName}
          className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0" style={{
          background: `linear-gradient(160deg, ${color}30 0%, ${color}08 50%, var(--chat-bg, #fafafa) 100%)`,
        }}>
          <ShoppingBag className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 opacity-[0.06]"
            style={{ color }} />
        </div>
      )}
      <div className="absolute inset-0"
        style={{ background: hasImage
          ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 50%, transparent 65%)'
          : 'linear-gradient(to top, rgba(0,0,0,0.06) 0%, transparent 40%)' }} />
      {/* Sale / Featured badges */}
      {(product.is_featured || product.is_on_sale) && (
        <div className="absolute top-4 right-4 flex gap-2">
          {product.is_on_sale && (
            <span className="text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-md"
              style={{ background: 'rgba(239,68,68,0.4)', color: '#fff' }}>מבצע</span>
          )}
          {product.is_featured && (
            <span className="text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-1"
              style={{ background: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
              <Star className="w-3 h-3" /> מומלץ
            </span>
          )}
        </div>
      )}
      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-5" dir="rtl">
        <h2 className="font-bold text-xl leading-tight"
          style={{ color: hasImage ? '#fff' : 'var(--text-primary, #1f2937)',
            textShadow: hasImage ? '0 2px 8px rgba(0,0,0,0.5)' : 'none' }}>
          {displayName}
        </h2>
        {ai.whatItDoes && (
          <p className="text-[12px] mt-1.5 leading-relaxed line-clamp-2 opacity-90"
            style={{ color: hasImage ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary, #6b7280)' }}>
            {ai.whatItDoes}
          </p>
        )}
        <div className="flex items-center gap-3 mt-3">
          {product.price != null && (
            <span className="text-lg font-bold"
              style={{ color: hasImage ? '#fff' : 'var(--color-primary, #7c3aed)' }}>
              ₪{product.price}
            </span>
          )}
          {product.volume && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: hasImage ? 'rgba(255,255,255,0.15)' : `${color}12`,
                color: hasImage ? 'rgba(255,255,255,0.7)' : color,
                backdropFilter: 'blur(8px)',
              }}>
              {product.volume}
            </span>
          )}
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-4 py-2 rounded-full"
          style={{
            background: hasImage ? 'rgba(255,255,255,0.2)' : 'var(--color-primary, #7c3aed)',
            color: hasImage ? '#fff' : '#fff',
            backdropFilter: 'blur(12px)',
          }}>
          לפרטים
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </button>
  );
}

/** Horizontal scroll row — Apple-style carousel */
function ScrollRow({ title, products, onSelect, accent }: {
  title: string; products: Product[]; onSelect: (p: Product) => void; accent?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5 px-1" dir="rtl">
        <div className="w-1 h-4 rounded-full" style={{ background: accent || 'var(--color-primary, #7c3aed)' }} />
        <h3 className="font-bold text-[13px]" style={{ color: 'var(--text-primary, #1f2937)' }}>{title}</h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--border-color, #f3f4f6)', color: 'var(--text-secondary,#9ca3af)' }}>
          {products.length}
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-2 px-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {products.map(p => (
          <div key={p.id} className="shrink-0 snap-start" style={{ width: '140px' }}>
            <PinCard product={p} onClick={() => onSelect(p)} aspect="4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Masonry 2-col with alternating tall/short — like DiscoveryTab */
function MasonryGrid({ products, onSelect }: { products: Product[]; onSelect: (p: Product) => void }) {
  const rightCol: Product[] = [];
  const leftCol: Product[] = [];
  products.forEach((p, i) => (i % 2 === 0 ? rightCol : leftCol).push(p));

  const getAspect = (colIndex: number, itemIndex: number) => {
    // Alternate tall (9/16) and short (4/5) for visual rhythm
    const pattern = colIndex === 0
      ? ['9/16', '4/5', '9/16'] // right: tall, short, tall
      : ['4/5', '9/16', '4/5']; // left: short, tall, short
    return pattern[itemIndex % 3];
  };

  return (
    <div className="flex gap-2.5" dir="rtl">
      {[rightCol, leftCol].map((col, colIdx) => (
        <div key={colIdx} className="flex-1 flex flex-col gap-2.5">
          {col.map((p, i) => (
            <PinCard key={p.id} product={p} onClick={() => onSelect(p)} aspect={getAspect(colIdx, i)} />
          ))}
        </div>
      ))}
    </div>
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

  // Split products for hybrid layout:
  // - Hero: top 2 featured (or first 2 with images)
  // - Carousels: each product_line group
  // - Masonry: everything else
  const heroProducts = (searchQuery || activeCategory)
    ? [] // no hero when filtering
    : filtered.filter(p => p.is_featured && p.image_url).slice(0, 2).length > 0
      ? filtered.filter(p => p.is_featured && p.image_url).slice(0, 2)
      : filtered.filter(p => p.image_url).slice(0, 1);

  const heroIds = new Set(heroProducts.map(p => p.id));
  const nonHero = filtered.filter(p => !heroIds.has(p.id));

  // Carousel groups (product_line with 3+ items)
  const carouselGroups: [string, Product[]][] = [];
  const remaining: Product[] = [];
  if (!searchQuery && sortedGroups.length > 0) {
    for (const [name, items] of sortedGroups) {
      const groupItems = items.filter(p => !heroIds.has(p.id));
      if (groupItems.length >= 3) {
        carouselGroups.push([name, groupItems]);
      } else {
        remaining.push(...groupItems);
      }
    }
    remaining.push(...noLine.filter(p => !heroIds.has(p.id)));
  } else {
    remaining.push(...nonHero);
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#f8f9fb' }}
      >
        <div className="max-w-[700px] mx-auto px-4 pt-4 pb-6" dir="rtl">
          {/* Search (sticky-ish, compact) */}
          {products.length > 6 && (
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#9ca3af' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש מוצר..."
                className="w-full pr-9 pl-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2"
                style={{ background: '#fff', color: '#1f2937', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              />
            </div>
          )}

          {/* Category pills */}
          {categories.length > 1 && (
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setActiveCategory(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all"
                style={{
                  background: !activeCategory ? 'var(--color-primary, #7c3aed)' : '#fff',
                  color: !activeCategory ? '#fff' : '#6b7280',
                  boxShadow: !activeCategory ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                הכל
              </button>
              {categories.map(cat => {
                const catColor = CATEGORY_COLORS[cat] || '#64748b';
                const isActive = activeCategory === cat;
                return (
                  <button key={cat}
                    onClick={() => setActiveCategory(isActive ? null : cat)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all"
                    style={{
                      background: isActive ? `${catColor}15` : '#fff',
                      color: isActive ? catColor : '#6b7280',
                      boxShadow: isActive ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                      border: isActive ? `1px solid ${catColor}30` : '1px solid transparent',
                    }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                    {CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingBag className="w-14 h-14 mx-auto mb-3" style={{ color: '#d1d5db' }} />
              <p className="text-sm" style={{ color: '#9ca3af' }}>
                {searchQuery ? 'לא נמצאו מוצרים' : 'אין מוצרים עדיין'}
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {/* === HERO SECTION === */}
              {heroProducts.length > 0 && (
                <div className="space-y-3">
                  {heroProducts.map(p => (
                    <HeroCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
                  ))}
                </div>
              )}

              {/* === CAROUSEL SECTIONS === */}
              {carouselGroups.map(([name, items]) => (
                <ScrollRow key={name} title={name} products={items}
                  onSelect={setSelectedProduct}
                  accent={getCategoryColor(items[0]?.category)} />
              ))}

              {/* === MASONRY DISCOVERY === */}
              {remaining.length > 0 && (
                <div>
                  {carouselGroups.length > 0 && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className="w-1 h-4 rounded-full" style={{ background: 'var(--color-primary, #7c3aed)' }} />
                      <h3 className="font-bold text-[13px]" style={{ color: '#1f2937' }}>
                        {remaining.length === nonHero.length ? 'כל המוצרים' : 'עוד מוצרים'}
                      </h3>
                    </div>
                  )}
                  <MasonryGrid products={remaining} onSelect={setSelectedProduct} />
                </div>
              )}
            </div>
          )}

          <div className="h-8" />
        </div>
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
