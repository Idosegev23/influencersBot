'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { track } from '@/lib/analytics/track';
import {
  Loader2, Search, ExternalLink, ShoppingBag,
  X, Sparkles, AlignCenter, Check, Plus,
} from 'lucide-react';
import DekelProductsCatalog from './DekelProductsCatalog';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  slug?: string | null;
  name: string;
  name_he?: string;
  brand?: string | null;
  description?: string;
  usage?: string | null;
  claims?: string[];
  ingredients?: string[]; // full INCI list
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
    promo_percent?: number | null;
    key_ingredients_detailed?: { name: string; note: string | null }[];
  };
  complementary_ids?: string[];
}

// Curated, ordered list of "high-impact" claim filters surfaced as chips.
// Anything else falls into the dropdown (only shown if products have claims at all).
const PRIMARY_CLAIM_FILTERS: { value: string; label: string; icon: '🤰' | '🌿' | '🪻' | '🇮🇱' | '🛡️' | '☀️' }[] = [
  { value: 'מאושר בהיריון / הנקה', label: 'הריון / הנקה', icon: '🤰' },
  { value: 'נבדק לעור רגיש', label: 'עור רגיש', icon: '🛡️' },
  { value: 'ללא פרבנים', label: 'ללא פרבנים', icon: '🌿' },
  { value: 'ללא בישום', label: 'ללא בישום', icon: '🪻' },
  { value: 'ללא אלכוהול מייבש', label: 'ללא אלכוהול', icon: '🌿' },
  { value: 'מיוצר בישראל', label: 'תוצרת ישראל', icon: '🇮🇱' },
  { value: 'לא מעלה את רגישות העור לשמש', label: 'לא רגישות לשמש', icon: '☀️' },
];

interface ProductsCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  accountType?: string;
  /** Account username — required for the polished editorial catalog (used to
   *  load ingredient autocomplete suggestions for follower-side search). */
  username?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
  return products.some(p => FOOD_CATEGORIES.has(p.category || ''));
}

function isBeautyBrand(products: Product[]): boolean {
  return products.some(p => BEAUTY_CATEGORIES.has(p.category || ''));
}

function categoryLabel(cat?: string): string {
  if (!cat) return '';
  return CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ');
}

/** Build rich hidden context from a product for the AI */
function buildProductContext(product: Product): string {
  const ai = product.ai_profile || {};
  const parts: string[] = [];
  parts.push(`[מוצר: ${product.name_he || product.name}]`);
  if (product.name_he && product.name && product.name_he !== product.name) {
    parts.push(`[שם באנגלית: ${product.name}]`);
  }
  if (product.brand) parts.push(`[מותג: ${product.brand}]`);
  if (product.category) parts.push(`[קטגוריה: ${categoryLabel(product.category)}]`);
  if (product.subcategory) parts.push(`[תת-קטגוריה: ${product.subcategory}]`);
  if (product.product_line) parts.push(`[קו מוצרים: ${product.product_line}]`);
  if (product.price != null) parts.push(`[מחיר: ₪${product.price}]`);
  if (product.original_price) parts.push(`[מחיר מקורי: ₪${product.original_price}]`);
  if (product.volume) parts.push(`[נפח/גודל: ${product.volume}]`);
  if (product.is_on_sale) parts.push(`[במבצע]`);
  if (product.is_featured) parts.push(`[מוצר מומלץ]`);
  if (product.claims?.length) parts.push(`[תגיות: ${product.claims.join(', ')}]`);
  if (ai.whatItDoes) parts.push(`[תיאור: ${ai.whatItDoes}]`);
  if (product.description && product.description !== ai.whatItDoes) parts.push(`[תיאור נוסף: ${product.description}]`);
  if (ai.key_ingredients_detailed?.length) {
    const detailed = ai.key_ingredients_detailed
      .slice(0, 12)
      .map((k) => (k.note ? `${k.name} — ${k.note}` : k.name))
      .join('; ');
    parts.push(`[רכיבי מפתח: ${detailed}]`);
  } else if (product.key_ingredients?.length) {
    parts.push(`[מרכיבים: ${product.key_ingredients.join(', ')}]`);
  }
  if (product.benefits?.length) parts.push(`[יתרונות: ${product.benefits.join(', ')}]`);
  if (product.target_audience?.length) parts.push(`[קהל יעד: ${product.target_audience.join(', ')}]`);
  if (ai.sellingPoints?.length) parts.push(`[נקודות מכירה: ${ai.sellingPoints.join(', ')}]`);
  if (ai.bestFor?.length) parts.push(`[מתאים ל: ${ai.bestFor.join(', ')}]`);
  if (ai.pairsWith?.length) parts.push(`[משתלב עם: ${ai.pairsWith.join(', ')}]`);
  if (product.usage) parts.push(`[אופן השימוש: ${product.usage}]`);
  if (product.product_url) parts.push(`[לינק לדף המוצר: ${product.product_url}]`);
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Featured product card — white card with centered image + CTA      */
/* ------------------------------------------------------------------ */

function FeaturedProductCard({ product, selected, onOpen, onToggleSelect }: {
  product: Product;
  selected: boolean;
  onOpen: (p: Product) => void;
  onToggleSelect: (p: Product) => void;
}) {
  const displayName = product.name_he || product.name;
  const description = product.ai_profile?.whatItDoes || product.description;
  // First two PRIMARY claims a product matches — kept short for the featured card.
  const featuredClaims = product.claims
    ? PRIMARY_CLAIM_FILTERS.filter((f) => product.claims!.includes(f.value)).slice(0, 2)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`pcat-featured ${selected ? 'pcat-featured--selected' : ''}`}
    >
      <button
        type="button"
        onClick={() => onOpen(product)}
        className="pcat-featured__main"
        aria-label={`${displayName} — לפרטים`}
      >
        <div className="pcat-featured__img">
          {product.image_url ? (
            <img src={product.image_url} alt={displayName} loading="lazy" />
          ) : (
            <div className="pcat-featured__ph">
              <ShoppingBag className="w-10 h-10" />
            </div>
          )}
        </div>
        <div className="pcat-featured__body">
          {product.brand && (
            <span className="pcat-featured__brand" style={{ fontSize: 11, opacity: 0.65, display: 'block', marginBottom: 4 }}>
              {product.brand}
            </span>
          )}
          <h2 className="pcat-featured__title">{displayName}</h2>
          {description && <p className="pcat-featured__desc">{description}</p>}
          {featuredClaims.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {featuredClaims.map((c) => (
                <span
                  key={c.value}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(136,63,226,0.10)',
                    color: '#883fe2',
                    fontWeight: 500,
                  }}
                >
                  {c.icon} {c.label}
                </span>
              ))}
            </div>
          )}
          <span className="pcat-featured__cta">
            <ExternalLink className="w-3.5 h-3.5 pcat-cta-icon" />
            לפרטים
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(product);
        }}
        className={`pcat-select-btn ${selected ? 'pcat-select-btn--on' : ''}`}
        aria-label={selected ? 'הסרה מהבחירה' : 'הוספה לבחירה'}
        aria-pressed={selected}
      >
        {selected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rail product card — 140x175, purple bottom overlay                */
/* ------------------------------------------------------------------ */

function RailProductCard({ product, selected, onOpen, onToggleSelect }: {
  product: Product;
  selected: boolean;
  onOpen: (p: Product) => void;
  onToggleSelect: (p: Product) => void;
}) {
  const displayName = product.name_he || product.name;
  // Tiny single-icon affordance: highlight the most-impactful claim a product carries.
  const topClaim = product.claims
    ? PRIMARY_CLAIM_FILTERS.find((f) => product.claims!.includes(f.value))
    : undefined;
  return (
    <div className={`pcat-rail-card ${selected ? 'pcat-rail-card--selected' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(product)}
        className="pcat-rail-card__main"
        aria-label={`${displayName} — לפרטים`}
      >
        {product.image_url ? (
          <img src={product.image_url} alt={displayName} loading="lazy" className="pcat-rail-card__img" />
        ) : (
          <div className="pcat-rail-card__ph">
            <ShoppingBag className="w-7 h-7" />
          </div>
        )}
        {topClaim && (
          <span
            title={topClaim.label}
            aria-label={topClaim.label}
            style={{
              position: 'absolute',
              top: 6,
              insetInlineStart: 6,
              fontSize: 14,
              lineHeight: 1,
              padding: 4,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.92)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              zIndex: 1,
            }}
          >
            {topClaim.icon}
          </span>
        )}
        <div className="pcat-rail-card__overlay">
          <p className="pcat-rail-card__title">{displayName}</p>
          {product.brand && !product.price && (
            <p className="pcat-rail-card__price" style={{ fontSize: 10, opacity: 0.85 }}>
              {product.brand.split('|')[0].trim()}
            </p>
          )}
          {product.price != null && (
            <p className="pcat-rail-card__price">₪{product.price}</p>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(product);
        }}
        className={`pcat-select-btn pcat-select-btn--rail ${selected ? 'pcat-select-btn--on' : ''}`}
        aria-label={selected ? 'הסרה מהבחירה' : 'הוספה לבחירה'}
        aria-pressed={selected}
      >
        {selected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category rail — title with purple right border + horizontal scroll */
/* ------------------------------------------------------------------ */

function CategoryRail({ title, products, selectedIds, onOpen, onToggleSelect }: {
  title: string;
  products: Product[];
  selectedIds: Set<string>;
  onOpen: (p: Product) => void;
  onToggleSelect: (p: Product) => void;
}) {
  if (products.length === 0) return null;
  return (
    <section className="pcat-rail">
      <header className="pcat-rail__header">
        <h3 className="pcat-rail__title">{title}</h3>
        <span className="pcat-rail__count">{products.length}</span>
      </header>
      <div className="pcat-rail__scroll">
        {products.map(p => (
          <RailProductCard
            key={p.id}
            product={p}
            selected={selectedIds.has(p.id)}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Category filter chips (horizontal scroll)                          */
/* ------------------------------------------------------------------ */

function CategoryChips({ categories, active, onChange }: {
  categories: string[];
  active: string | null;
  onChange: (c: string | null) => void;
}) {
  return (
    <div className="pcat-chips">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`pcat-chip ${active === null ? 'pcat-chip--active' : ''}`}
      >
        הכל
      </button>
      {categories.map(cat => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(isActive ? null : cat)}
            className={`pcat-chip ${isActive ? 'pcat-chip--active' : ''}`}
          >
            <span>{categoryLabel(cat)}</span>
            <span className="pcat-chip__dot" />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Claim filter chips — pregnancy-safe, paraben-free, etc.            */
/*  Only renders if at least one product carries one of the claims.    */
/* ------------------------------------------------------------------ */

function ClaimChips({ available, active, onChange }: {
  available: Map<string, number>;
  active: string | null;
  onChange: (c: string | null) => void;
}) {
  const visible = PRIMARY_CLAIM_FILTERS.filter((f) => available.has(f.value));
  if (!visible.length) return null;
  return (
    <div className="pcat-chips" role="tablist" aria-label="סינון לפי תגיות">
      {visible.map((f) => {
        const count = available.get(f.value) || 0;
        const isActive = active === f.value;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(isActive ? null : f.value)}
            className={`pcat-chip ${isActive ? 'pcat-chip--active' : ''}`}
            role="tab"
            aria-selected={isActive}
          >
            <span aria-hidden style={{ marginInlineEnd: 4 }}>{f.icon}</span>
            <span>{f.label}</span>
            <span className="pcat-chip__count" style={{ opacity: 0.55, marginInlineStart: 6, fontSize: '0.85em' }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product detail sheet — bottom sheet per Figma 431:4765             */
/* ------------------------------------------------------------------ */

function ProductSheet({ product, onClose, onAskAbout }: {
  product: Product;
  onClose: () => void;
  onAskAbout: (q: string, hiddenContext?: string) => void;
}) {
  const displayName = product.name_he || product.name;
  const description = product.ai_profile?.whatItDoes || product.description;
  const sellingPoints = product.ai_profile?.sellingPoints || [];
  const benefits = product.benefits || [];
  const showcaseChips = [...sellingPoints, ...benefits].slice(0, 6);
  const detailedIngredients = product.ai_profile?.key_ingredients_detailed || [];
  const fallbackIngredientNames = product.key_ingredients || [];
  const fullInci = product.ingredients || [];
  const claims = product.claims || [];
  const matchedClaims = PRIMARY_CLAIM_FILTERS.filter((f) => claims.includes(f.value));
  const otherClaims = claims.filter((c) => !PRIMARY_CLAIM_FILTERS.some((f) => f.value === c));
  const promoPercent = product.ai_profile?.promo_percent;
  const [showFullInci, setShowFullInci] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pcat-sheet-backdrop"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="pcat-sheet"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="pcat-sheet__close" aria-label="סגירה">
          <X className="w-6 h-6" />
        </button>

        <div className="pcat-sheet__scroll">
          {product.image_url && (
            <div className="pcat-sheet__img">
              <img src={product.image_url} alt={displayName} />
              {promoPercent && (
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    insetInlineStart: 12,
                    background: '#883fe2',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 999,
                  }}
                >
                  {promoPercent}% הנחה
                </span>
              )}
            </div>
          )}

          <div className="pcat-sheet__head">
            {product.brand && (
              <span style={{ display: 'block', fontSize: 12, opacity: 0.65, marginBottom: 4 }}>
                {product.brand}
              </span>
            )}
            <h2 className="pcat-sheet__title">{displayName}</h2>
            {product.category && (
              <span className="pcat-sheet__category">
                <span>{categoryLabel(product.category)}</span>
                <span className="pcat-sheet__category-dot" />
              </span>
            )}
          </div>

          {/* Primary safety/quality claims as compact icon chips */}
          {matchedClaims.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBlock: 10 }}>
              {matchedClaims.map((c) => (
                <span
                  key={c.value}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'rgba(136,63,226,0.10)',
                    color: '#883fe2',
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {description && (
            <p className="pcat-sheet__desc" style={{ whiteSpace: 'pre-line' }}>{description}</p>
          )}

          {product.price != null && (
            <div className="pcat-sheet__price-row">
              <span className="pcat-sheet__price">₪{product.price}</span>
              {product.is_on_sale && product.original_price && (
                <span className="pcat-sheet__price-old">₪{product.original_price}</span>
              )}
              {product.volume && <span className="pcat-sheet__volume">{product.volume}</span>}
            </div>
          )}

          {showcaseChips.length > 0 && (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>למה זה מיוחד?</span>
                <Sparkles className="w-3.5 h-3.5" />
              </header>
              <div className="pcat-sheet__chips">
                {showcaseChips.map((chip, i) => (
                  <span key={i} className="pcat-sheet__chip">{chip}</span>
                ))}
              </div>
            </section>
          )}

          {/* Rich key-ingredients view: name + Hebrew explanation per ingredient.
              Falls back to plain chips if we only have names. */}
          {detailedIngredients.length > 0 ? (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>רכיבי מפתח</span>
                <Sparkles className="w-3.5 h-3.5" />
              </header>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
                {detailedIngredients.slice(0, 25).map((ing, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: 'rgba(136,63,226,0.06)',
                      borderInlineStart: '3px solid #883fe2',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{ing.name}</div>
                      {ing.note && (
                        <div style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.85 }}>{ing.note}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : fallbackIngredientNames.length > 0 ? (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>מרכיבים עיקריים</span>
                <Sparkles className="w-3.5 h-3.5" />
              </header>
              <div className="pcat-sheet__chips">
                {fallbackIngredientNames.map((ing, i) => (
                  <span key={i} className="pcat-sheet__chip">{ing}</span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Other claim tags (anything not in PRIMARY_CLAIM_FILTERS) */}
          {otherClaims.length > 0 && (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>תגיות נוספות</span>
              </header>
              <div className="pcat-sheet__chips">
                {otherClaims.map((c, i) => (
                  <span key={i} className="pcat-sheet__chip">{c}</span>
                ))}
              </div>
            </section>
          )}

          {product.usage && (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>אופן השימוש</span>
              </header>
              <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{product.usage}</p>
            </section>
          )}

          {/* Full INCI list — collapsed by default to avoid drowning the sheet */}
          {fullInci.length > 0 && (
            <section className="pcat-sheet__section">
              <button
                type="button"
                onClick={() => setShowFullInci((v) => !v)}
                style={{
                  fontSize: 12,
                  color: '#883fe2',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {showFullInci
                  ? 'הסתירי רשימת רכיבים מלאה'
                  : `הציגי רשימת רכיבים מלאה (INCI) — ${fullInci.length}`}
              </button>
              {showFullInci && (
                <p
                  dir="ltr"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.6,
                    opacity: 0.75,
                    marginTop: 8,
                    textAlign: 'left',
                  }}
                >
                  {fullInci.join(', ')}
                </p>
              )}
            </section>
          )}
        </div>

        <div className="pcat-sheet__actions">
          {product.product_url && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="pcat-sheet__btn pcat-sheet__btn--secondary"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              לסקירה המלאה של דקל
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              onAskAbout(`ספרו לי עוד על ${displayName}`, buildProductContext(product));
              onClose();
            }}
            className="pcat-sheet__btn pcat-sheet__btn--primary"
          >
            <AlignCenter className="w-3.5 h-3.5" />
            שאלו על המוצר
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-select sticky action bar                                     */
/* ------------------------------------------------------------------ */

function MultiSelectBar({ count, onClear, onAsk }: {
  count: number;
  onClear: () => void;
  onAsk: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="pcat-multibar"
      dir="rtl"
    >
      <button type="button" onClick={onClear} className="pcat-multibar__clear" aria-label="ניקוי בחירה">
        <X className="w-4 h-4" />
        <span>ניקוי</span>
      </button>
      <span className="pcat-multibar__count">
        נבחרו <strong>{count}</strong> {count === 1 ? 'מוצר' : 'מוצרים'}
      </span>
      <button type="button" onClick={onAsk} className="pcat-multibar__ask">
        <Sparkles className="w-4 h-4" />
        <span>{count === 1 ? 'שאלו על המוצר' : 'השוו ושאלו'}</span>
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProductsCatalogTab({ accountId, onAskAbout, username }: ProductsCatalogTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeClaim, setActiveClaim] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((p: Product) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
        track('product_deselected', { product_id: p.id, product_name: p.name });
      } else {
        next.add(p.id);
        track('product_selected', { product_id: p.id, product_name: p.name });
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

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

  const filtered = useMemo(() => products.filter(p => {
    if (activeCategory && p.category !== activeCategory) return false;
    if (activeClaim && !(p.claims || []).includes(activeClaim)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name_he || p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.ai_profile?.whatItDoes || '').toLowerCase().includes(q) ||
      (p.key_ingredients || []).some(ing => ing.toLowerCase().includes(q)) ||
      (p.ingredients || []).some(ing => ing.toLowerCase().includes(q)) ||
      (p.ai_profile?.key_ingredients_detailed || []).some(
        (k) => k.name.toLowerCase().includes(q) || (k.note || '').toLowerCase().includes(q)
      );
  }), [products, activeCategory, activeClaim, searchQuery]);

  const categories = useMemo(
    () => [...new Set(products.map(p => p.category).filter(Boolean))] as string[],
    [products],
  );

  // Claim → count map across the *unfiltered* catalog so chips stay stable.
  const claimAvailability = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      for (const c of p.claims || []) m.set(c, (m.get(c) || 0) + 1);
    }
    return m;
  }, [products]);

  const featured = useMemo(() => {
    if (searchQuery || activeCategory || activeClaim) return null;
    return (
      filtered.find(p => p.is_featured && p.image_url) ||
      filtered.find(p => p.image_url) ||
      filtered[0] ||
      null
    );
  }, [filtered, searchQuery, activeCategory, activeClaim]);

  const nonFeatured = useMemo(
    () => featured ? filtered.filter(p => p.id !== featured.id) : filtered,
    [filtered, featured],
  );

  /**
   * Group non-featured products into rails strictly by `product_line` (the "series").
   * Series with fewer than MIN_RAIL_SIZE items collapse into one "סדרות נוספות" rail
   * so the catalog stays clean instead of fragmenting into singletons.
   */
  const rails = useMemo(() => {
    const MIN_RAIL_SIZE = 3;

    const sortItems = (items: Product[]) => [...items].sort((a, b) => {
      if (!!b.is_featured !== !!a.is_featured) return b.is_featured ? 1 : -1;
      if (!!b.is_on_sale !== !!a.is_on_sale) return b.is_on_sale ? 1 : -1;
      return (a.name_he || a.name || '').localeCompare(b.name_he || b.name || '', 'he');
    });

    const byLine = new Map<string, Product[]>();
    const orphans: Product[] = [];
    for (const p of nonFeatured) {
      // Prefer explicit product_line; fall back to brand so catalogs that don't fill in
      // product_line (e.g. Dekel's per-brand grouping) still get nice rails instead of
      // collapsing into one giant "סדרות נוספות" bucket.
      const line = (p.product_line || p.brand || '').trim();
      if (line) {
        if (!byLine.has(line)) byLine.set(line, []);
        byLine.get(line)!.push(p);
      } else {
        orphans.push(p);
      }
    }

    const bigLines: { title: string; products: Product[] }[] = [];
    const smallItems: Product[] = [];
    for (const [name, items] of byLine.entries()) {
      if (items.length >= MIN_RAIL_SIZE) {
        bigLines.push({ title: name, products: sortItems(items) });
      } else {
        smallItems.push(...items);
      }
    }
    bigLines.sort((a, b) => b.products.length - a.products.length);

    const groups: { title: string; products: Product[] }[] = [...bigLines];

    const tail = sortItems([...smallItems, ...orphans]);
    if (tail.length > 0) {
      groups.push({ title: 'סדרות נוספות', products: tail });
    }

    return groups;
  }, [nonFeatured]);

  const food = isFoodBrand(products);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  // Editorial catalogs (claim-tagged products like Dekel's) get the polished
  // grid layout with smart ingredient search. Brand catalogs without claims
  // keep the existing horizontal-rail UX.
  if (claimAvailability.size > 0 && username) {
    return (
      <DekelProductsCatalog
        username={username}
        accountId={accountId}
        products={products}
        onAskAbout={onAskAbout}
      />
    );
  }

  return (
    <>
      <div className="pcat-tab" dir="rtl">
        <div className="pcat-tab__inner">
          {products.length > 4 && (
            <div className="pcat-search">
              <Search className="pcat-search__icon w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={food ? 'חיפוש מוצר או מתכון' : 'חיפוש מוצר'}
                className="pcat-search__input"
              />
            </div>
          )}

          {claimAvailability.size > 0 && (
            <ClaimChips
              available={claimAvailability}
              active={activeClaim}
              onChange={(v) => {
                track('product_claim_filter', { claim: v });
                setActiveClaim(v);
              }}
            />
          )}

          {categories.length > 1 && (
            <CategoryChips
              categories={categories}
              active={activeCategory}
              onChange={setActiveCategory}
            />
          )}

          {filtered.length === 0 ? (
            <div className="pcat-empty">
              <ShoppingBag className="w-14 h-14 mx-auto mb-3" style={{ color: '#d1d5db' }} />
              <p>{searchQuery || activeCategory ? 'לא נמצאו מוצרים' : 'אין מוצרים עדיין'}</p>
            </div>
          ) : (
            <div className="pcat-body">
              {featured && (
                <FeaturedProductCard
                  product={featured}
                  selected={selectedIds.has(featured.id)}
                  onOpen={(p) => {
                    track('product_card_clicked', { product_id: p.id, product_name: p.name, placement: 'featured' });
                    setSelectedProduct(p);
                  }}
                  onToggleSelect={toggleSelect}
                />
              )}

              {rails.map(rail => (
                <CategoryRail
                  key={rail.title}
                  title={rail.title}
                  products={rail.products}
                  selectedIds={selectedIds}
                  onOpen={(p) => {
                    track('product_card_clicked', { product_id: p.id, product_name: p.name, placement: 'rail', rail_title: rail.title });
                    setSelectedProduct(p);
                  }}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}

          <div className="h-32" />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <MultiSelectBar
          count={selectedIds.size}
          onClear={clearSelection}
          onAsk={() => {
            const picked = products.filter(p => selectedIds.has(p.id));
            if (picked.length === 0) return;
            const names = picked.map(p => p.name_he || p.name).join(', ');
            const question = picked.length === 1
              ? `ספרו לי על ${names}`
              : `ספרו לי על המוצרים האלה: ${names} — איך הם משתלבים זה עם זה ומה ההבדלים?`;
            const hidden = picked.map(buildProductContext).join('\n\n---\n\n');
            track('product_multi_ask', {
              count: picked.length,
              product_ids: picked.map(p => p.id),
            });
            onAskAbout(question, hidden);
            clearSelection();
          }}
        />
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedProduct && (
            <ProductSheet
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
              onAskAbout={onAskAbout}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
