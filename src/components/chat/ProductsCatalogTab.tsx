'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { track } from '@/lib/analytics/track';
import {
  Loader2, Search, ExternalLink, ShoppingBag,
  X, Sparkles, AlignCenter, Check, Plus,
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
  accountType?: string;
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
  if (product.category) parts.push(`[קטגוריה: ${categoryLabel(product.category)}]`);
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
          <h2 className="pcat-featured__title">{displayName}</h2>
          {description && <p className="pcat-featured__desc">{description}</p>}
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
        <div className="pcat-rail-card__overlay">
          <p className="pcat-rail-card__title">{displayName}</p>
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
  const ingredients = product.key_ingredients || [];

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
            </div>
          )}

          <div className="pcat-sheet__head">
            <h2 className="pcat-sheet__title">{displayName}</h2>
            {product.category && (
              <span className="pcat-sheet__category">
                <span>{categoryLabel(product.category)}</span>
                <span className="pcat-sheet__category-dot" />
              </span>
            )}
          </div>

          {description && (
            <p className="pcat-sheet__desc">{description}</p>
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

          {ingredients.length > 0 && (
            <section className="pcat-sheet__section">
              <header className="pcat-sheet__section-header">
                <span>מרכיבים עיקריים</span>
                <Sparkles className="w-3.5 h-3.5" />
              </header>
              <div className="pcat-sheet__chips">
                {ingredients.map((ing, i) => (
                  <span key={i} className="pcat-sheet__chip">{ing}</span>
                ))}
              </div>
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
              לרכישה
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
            שאלו אותי על המוצר
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

export default function ProductsCatalogTab({ accountId, onAskAbout }: ProductsCatalogTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name_he || p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.ai_profile?.whatItDoes || '').toLowerCase().includes(q) ||
      (p.key_ingredients || []).some(ing => ing.toLowerCase().includes(q));
  }), [products, activeCategory, searchQuery]);

  const categories = useMemo(
    () => [...new Set(products.map(p => p.category).filter(Boolean))] as string[],
    [products],
  );

  const featured = useMemo(() => {
    if (searchQuery || activeCategory) return null;
    return (
      filtered.find(p => p.is_featured && p.image_url) ||
      filtered.find(p => p.image_url) ||
      filtered[0] ||
      null
    );
  }, [filtered, searchQuery, activeCategory]);

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
      const line = (p.product_line || '').trim();
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
