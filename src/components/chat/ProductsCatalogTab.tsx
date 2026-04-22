'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Search, ExternalLink, ShoppingBag,
  X, Sparkles, AlignCenter,
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

function FeaturedProductCard({ product, onOpen }: { product: Product; onOpen: (p: Product) => void }) {
  const displayName = product.name_he || product.name;
  const description = product.ai_profile?.whatItDoes || product.description;

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(product)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="pcat-featured"
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
          <ExternalLink className="w-3.5 h-3.5" />
          לפרטים
        </span>
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Rail product card — 140x175, purple bottom overlay                */
/* ------------------------------------------------------------------ */

function RailProductCard({ product, onOpen }: { product: Product; onOpen: (p: Product) => void }) {
  const displayName = product.name_he || product.name;
  return (
    <button type="button" onClick={() => onOpen(product)} className="pcat-rail-card">
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
  );
}

/* ------------------------------------------------------------------ */
/*  Category rail — title with purple right border + horizontal scroll */
/* ------------------------------------------------------------------ */

function CategoryRail({ title, products, onOpen }: {
  title: string; products: Product[]; onOpen: (p: Product) => void;
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
          <RailProductCard key={p.id} product={p} onOpen={onOpen} />
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProductsCatalogTab({ accountId, onAskAbout }: ProductsCatalogTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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

  /** Group non-featured products into rails by product_line (or category as fallback) */
  const rails = useMemo(() => {
    const byLine = new Map<string, Product[]>();
    const byCategory = new Map<string, Product[]>();
    for (const p of nonFeatured) {
      if (p.product_line) {
        if (!byLine.has(p.product_line)) byLine.set(p.product_line, []);
        byLine.get(p.product_line)!.push(p);
      } else if (p.category) {
        if (!byCategory.has(p.category)) byCategory.set(p.category, []);
        byCategory.get(p.category)!.push(p);
      }
    }

    const groups: { title: string; products: Product[] }[] = [];
    // Product lines first, sorted by size desc
    [...byLine.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([name, items]) => groups.push({ title: name, products: items }));
    // Then categories not already grouped by product_line
    [...byCategory.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([cat, items]) => groups.push({ title: categoryLabel(cat), products: items }));

    // Fallback: everything else in a single "כל המוצרים" rail
    const grouped = new Set(groups.flatMap(g => g.products.map(p => p.id)));
    const rest = nonFeatured.filter(p => !grouped.has(p.id));
    if (rest.length > 0) groups.push({ title: 'עוד מוצרים', products: rest });

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
                <FeaturedProductCard product={featured} onOpen={setSelectedProduct} />
              )}

              {rails.map(rail => (
                <CategoryRail
                  key={rail.title}
                  title={rail.title}
                  products={rail.products}
                  onOpen={setSelectedProduct}
                />
              ))}
            </div>
          )}

          <div className="h-24" />
        </div>
      </div>

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
