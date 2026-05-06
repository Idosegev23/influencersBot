'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Search,
  Filter,
  X,
  Loader2,
  ExternalLink,
  Eye,
  Tag as TagIcon,
  Beaker,
} from 'lucide-react';

interface Product {
  id: string;
  slug: string;
  name: string;
  name_he: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  usage: string | null;
  claims: string[];
  ingredients: string[];
  key_ingredients: string[];
  image_url: string | null;
  product_url: string | null;
  is_on_sale: boolean | null;
  ai_profile: {
    slug?: string;
    promo_percent?: number | null;
    has_promo?: boolean;
    key_ingredients_detailed?: { name: string; note: string | null }[];
    ingredient_ratings?: { name: string; score: string | null; note: string | null }[];
  } | null;
}

interface Facets {
  total: number;
  claims: { value: string; count: number }[];
  categories: { value: string; count: number }[];
  brands: { value: string; count: number }[];
}

const PRIMARY_CLAIMS = [
  'מאושר בהיריון / הנקה',
  'נבדק לעור רגיש',
  'ללא פרבנים',
  'ללא בישום',
  'ללא אלכוהול מייבש',
  'ללא שמנים אתריים',
  'מיוצר בישראל',
];

export default function ProductsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [activeClaim, setActiveClaim] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);

  // Initial auth + facets
  useEffect(() => {
    (async () => {
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push(`/influencer/${username}`);
        return;
      }
      const facetsRes = await fetch(`/api/influencer/products/facets?username=${username}`);
      const facetsData = await facetsRes.json();
      setFacets(facetsData);
    })();
  }, [username, router]);

  // Fetch products on filter change (debounced for search)
  useEffect(() => {
    const handle = setTimeout(() => {
      void loadProducts();
    }, search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [search, activeClaim, activeCategory, activeBrand, username]);

  async function loadProducts() {
    setLoading(true);
    const qs = new URLSearchParams({ username });
    if (search.trim()) qs.set('q', search.trim());
    if (activeClaim) qs.set('claim', activeClaim);
    if (activeCategory) qs.set('category', activeCategory);
    if (activeBrand) qs.set('brand', activeBrand);
    qs.set('limit', '200');
    const res = await fetch(`/api/influencer/products?${qs.toString()}`);
    const data = await res.json();
    setProducts(data.products || []);
    setTotal(data.total ?? null);
    setLoading(false);
  }

  const activeFiltersCount = useMemo(
    () => [activeClaim, activeCategory, activeBrand].filter(Boolean).length,
    [activeClaim, activeCategory, activeBrand]
  );

  const clearFilters = () => {
    setActiveClaim(null);
    setActiveCategory(null);
    setActiveBrand(null);
    setSearch('');
  };

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            מוצרים ורכיבים
          </h1>
          <div className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
            {total != null ? `${total.toLocaleString('he-IL')} מוצרים` : ''}
            {facets && total != null && total !== facets.total
              ? ` מתוך ${facets.total.toLocaleString('he-IL')}`
              : ''}
          </div>
        </div>

        {/* Preview banner — make it clear this is the catalog as it appears to followers */}
        <div
          className="glass-card rounded-2xl p-3 mb-5 flex items-center justify-between gap-3"
          style={{ border: '1px solid var(--dash-glass-border)' }}
        >
          <div className="flex items-start gap-2 min-w-0">
            <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
            <div className="min-w-0">
              <div className="text-sm font-medium">תצוגה מקדימה</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--dash-text-3)' }}>
                זו התצוגה שהעוקבות רואות בצ׳אט. כאן את יכולה לעבור על הקטלוג, לסנן ולוודא שהכל
                נראה כמו שצריך.
              </div>
            </div>
          </div>
          <a
            href={`/chat/${username}?tab=products`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-xl whitespace-nowrap font-medium flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            <ExternalLink className="w-3 h-3" />
            פתחי בצ׳אט
          </a>
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--dash-text-3)' }}
            />
            <input
              className="input w-full py-2.5 pr-10 pl-3 text-sm"
              placeholder="חיפוש לפי שם, מותג, רכיב…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 glass-card"
            style={{
              color: showFilters ? 'var(--color-primary)' : 'var(--dash-text-2)',
              border: showFilters ? '1px solid var(--color-primary)' : '1px solid transparent',
            }}
          >
            <Filter className="w-4 h-4" />
            סינון
            {activeFiltersCount > 0 && (
              <span
                className="text-[10px] px-1.5 rounded-full"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick claim chips — always visible, top 7 */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {PRIMARY_CLAIMS.map((c) => {
            const facet = facets?.claims.find((f) => f.value === c);
            if (!facet) return null;
            const isActive = activeClaim === c;
            return (
              <button
                key={c}
                onClick={() => setActiveClaim(isActive ? null : c)}
                className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-200 flex items-center gap-1.5"
                style={{
                  background: isActive ? 'var(--color-primary)' : 'var(--dash-surface)',
                  color: isActive ? '#fff' : 'var(--dash-text-2)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                {c}
                <span className="opacity-60">({facet.count})</span>
              </button>
            );
          })}
        </div>

        {/* Expanded filter panel */}
        {showFilters && facets && (
          <div className="glass-card rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slide-up">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>
                קטגוריה
              </label>
              <select
                className="input w-full py-2 px-3 text-sm"
                value={activeCategory || ''}
                onChange={(e) => setActiveCategory(e.target.value || null)}
              >
                <option value="">הכל ({facets.total})</option>
                {facets.categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>
                מותג
              </label>
              <select
                className="input w-full py-2 px-3 text-sm"
                value={activeBrand || ''}
                onChange={(e) => setActiveBrand(e.target.value || null)}
              >
                <option value="">הכל</option>
                {facets.brands.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.value} ({b.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--dash-text-3)' }}>
                כל התגיות
              </label>
              <select
                className="input w-full py-2 px-3 text-sm"
                value={activeClaim || ''}
                onChange={(e) => setActiveClaim(e.target.value || null)}
              >
                <option value="">הכל</option>
                {facets.claims.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </option>
                ))}
              </select>
            </div>
            {activeFiltersCount > 0 && (
              <div className="sm:col-span-3 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-xs flex items-center gap-1"
                  style={{ color: 'var(--dash-text-3)' }}
                >
                  <X className="w-3 h-3" />
                  נקה את כל הסינונים
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading / empty states */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
          </div>
        )}
        {!loading && products.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--dash-text-3)' }}>
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">לא נמצאו מוצרים תואמים</p>
          </div>
        )}

        {/* Product grid */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />
            ))}
          </div>
        )}
      </main>

      {selected && <ProductDetailModal product={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const promoPercent = product.ai_profile?.promo_percent;
  return (
    <button
      onClick={onClick}
      className="glass-card rounded-2xl p-3 text-right transition-all duration-200 hover:scale-[1.015]"
      style={{ border: '1px solid var(--dash-glass-border)' }}
    >
      <div
        className="aspect-square rounded-xl mb-2 overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--dash-surface)' }}
      >
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Sparkles className="w-8 h-8 opacity-30" />
        )}
      </div>
      <div className="text-[10px] mb-1 truncate" style={{ color: 'var(--dash-text-3)' }}>
        {product.brand || ''}
      </div>
      <div className="text-sm font-semibold mb-1 line-clamp-2 min-h-[2.5em]">{product.name}</div>
      <div className="flex flex-wrap gap-1">
        {product.category && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)' }}
          >
            {product.category}
          </span>
        )}
        {promoPercent && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {promoPercent}% הנחה
          </span>
        )}
      </div>
    </button>
  );
}

function ProductDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const keyDetailed = product.ai_profile?.key_ingredients_detailed || [];
  const inci = product.ingredients || [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 backdrop-blur-md"
          style={{ background: 'var(--dash-surface)', borderBottom: '1px solid var(--dash-glass-border)' }}
        >
          <div>
            <div className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{product.brand}</div>
            <h2 className="text-lg font-bold">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--dash-text-3)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Image + claims */}
          <div className="sm:col-span-1">
            <div
              className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center mb-3"
              style={{ background: 'var(--dash-surface)' }}
            >
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Sparkles className="w-16 h-16 opacity-30" />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {product.claims?.map((c) => (
                <span
                  key={c}
                  className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1"
                  style={{
                    background: 'var(--dash-surface)',
                    color: 'var(--dash-text-2)',
                    border: '1px solid var(--dash-glass-border)',
                  }}
                >
                  <TagIcon className="w-2.5 h-2.5" />
                  {c}
                </span>
              ))}
            </div>
            {product.product_url && (
              <a
                href={product.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--color-primary)' }}
              >
                <ExternalLink className="w-3 h-3" />
                לדף המוצר באתר של דקל
              </a>
            )}
          </div>

          {/* Right column: rich details */}
          <div className="sm:col-span-2 space-y-4">
            {product.category && (
              <div>
                <span
                  className="text-[10px] px-2 py-1 rounded-full"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >
                  {product.category}
                </span>
              </div>
            )}

            {product.description && (
              <div>
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--dash-text-2)' }}>
                  <Sparkles className="w-3.5 h-3.5" /> תיאור ויחודיות
                </h3>
                <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: 'var(--dash-text)' }}>
                  {product.description}
                </p>
              </div>
            )}

            {keyDetailed.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--dash-text-2)' }}>
                  <Beaker className="w-3.5 h-3.5" /> רכיבי מפתח
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {keyDetailed.slice(0, 30).map((k, i) => (
                    <li key={i} className="flex gap-2">
                      <span style={{ color: 'var(--color-primary)' }}>•</span>
                      <div>
                        <span className="font-medium">{k.name}</span>
                        {k.note && (
                          <span style={{ color: 'var(--dash-text-2)' }}> — {k.note}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.usage && (
              <div>
                <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--dash-text-2)' }}>
                  אופן השימוש
                </h3>
                <p className="text-sm" style={{ color: 'var(--dash-text)' }}>{product.usage}</p>
              </div>
            )}

            {inci.length > 0 && (
              <details>
                <summary
                  className="text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--dash-text-2)' }}
                >
                  רשימת רכיבים מלאה (INCI) — {inci.length}
                </summary>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--dash-text-3)' }} dir="ltr">
                  {inci.join(', ')}
                </p>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
