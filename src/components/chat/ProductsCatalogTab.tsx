'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Search, ExternalLink, Star, Flame, ShoppingBag } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  name_he?: string;
  description?: string;
  price?: number;
  original_price?: number;
  category?: string;
  subcategory?: string;
  product_line?: string;
  volume?: string;
  image_url?: string;
  product_url?: string;
  is_on_sale?: boolean;
  is_featured?: boolean;
  ai_profile?: {
    whatItDoes?: string;
    sellingPoints?: string[];
    bestFor?: string[];
  };
}

interface ProductsCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string) => void;
}

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

export default function ProductsCatalogTab({ accountId, onAskAbout }: ProductsCatalogTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      (p.ai_profile?.whatItDoes || '').toLowerCase().includes(q);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary, #7c3aed)' }} />
      </div>
    );
  }

  const renderCard = (product: Product) => {
    const ai = product.ai_profile || {};
    const hasAI = !!ai.whatItDoes;
    const displayName = product.name_he || product.name;

    return (
      <motion.div
        key={product.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="group rounded-2xl overflow-hidden border cursor-pointer"
        style={{
          background: 'var(--chat-bg, #fff)',
          borderColor: product.is_featured ? 'rgba(251,191,36,0.4)' : 'var(--border-color, #e5e7eb)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
        onClick={() => onAskAbout(`ספרו לי על ${displayName}`)}
      >
        {/* Image */}
        {product.image_url ? (
          <div className="relative h-32 overflow-hidden">
            <img
              src={product.image_url}
              alt={displayName}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
            {product.price != null && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <span className="text-sm font-bold text-white">₪{product.price}</span>
                {product.is_on_sale && product.original_price && (
                  <span className="text-[10px] line-through text-white/50">₪{product.original_price}</span>
                )}
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              {product.is_featured && (
                <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium backdrop-blur-sm"
                  style={{ background: 'rgba(251,191,36,0.25)', color: '#fbbf24' }}>
                  <Star className="w-2.5 h-2.5" />
                </span>
              )}
              {product.is_on_sale && (
                <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium backdrop-blur-sm"
                  style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>
                  <Flame className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="h-10 relative" style={{
            background: `linear-gradient(135deg, ${CATEGORY_COLORS[product.category || 'general'] || '#6366f1'}15, ${CATEGORY_COLORS[product.category || 'general'] || '#6366f1'}08)`,
          }}>
            <div className="absolute top-2 right-2 flex gap-1">
              {product.is_featured && <Star className="w-3 h-3" style={{ color: '#fbbf24' }} />}
              {product.is_on_sale && <Flame className="w-3 h-3" style={{ color: '#f87171' }} />}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-semibold text-[13px] leading-tight line-clamp-2" style={{ color: 'var(--text-primary, #1f2937)' }}>
              {displayName}
            </h3>
            {!product.image_url && product.price != null && (
              <span className="text-xs font-bold shrink-0" style={{ color: 'var(--color-primary, #7c3aed)' }}>
                ₪{product.price}
              </span>
            )}
          </div>

          {hasAI ? (
            <p className="text-[11px] mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary, #6b7280)' }}>
              {ai.whatItDoes}
            </p>
          ) : product.description ? (
            <p className="text-[11px] mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary, #6b7280)' }}>
              {product.description}
            </p>
          ) : null}

          {hasAI && ai.sellingPoints && ai.sellingPoints.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {ai.sellingPoints.slice(0, 2).map((sp, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--color-primary-10, rgba(124,58,237,0.08))', color: 'var(--color-primary, #7c3aed)' }}>
                  {sp}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color, #f3f4f6)' }}>
            {product.volume && (
              <span className="text-[9px]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>{product.volume}</span>
            )}
            <div className="flex-1" />
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
  };

  const renderSection = (title: string, items: Product[], accent?: string) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-1 h-5 rounded-full" style={{ background: accent || 'var(--color-primary, #7c3aed)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary, #1f2937)' }}>{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border-color, #f3f4f6)', color: 'var(--text-secondary, #9ca3af)' }}>
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map(p => renderCard(p))}
      </div>
    </div>
  );

  return (
    <div className="px-3 py-4" dir="rtl">
      {/* Search */}
      {products.length > 10 && (
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary, #9ca3af)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="חיפוש מוצר..."
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
              </button>
            );
          })}
        </div>
      )}

      {/* Products */}
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
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map(p => renderCard(p))}
        </div>
      )}
    </div>
  );
}
