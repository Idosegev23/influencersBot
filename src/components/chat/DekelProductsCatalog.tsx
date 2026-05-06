'use client';

/**
 * Polished, follower-facing product catalog (editorial style).
 *
 * Used when an account's products carry editorial claim tags (pregnancy-safe,
 * fragrance-free, etc.) — i.e. content-creator catalogs (Dekel) rather than
 * straight-line e-commerce brand catalogs.
 *
 * Visual reference: Aesop / Glossier — single warm parchment ground, one
 * neutral image-card tint, generous breathing room, minimal text per card.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ExternalLink, Sparkles, Beaker, ChevronDown, Check } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { IngredientDictProvider, InciList, type IngredientInfo } from './IngredientTooltip';

// ============================================================================
// Types
// ============================================================================

export interface DekelProduct {
  id: string;
  slug?: string | null;
  name: string;
  name_he?: string;
  brand?: string | null;
  description?: string | null;
  usage?: string | null;
  claims?: string[];
  ingredients?: string[];
  category?: string | null;
  subcategory?: string | null;
  product_line?: string | null;
  price?: number | null;
  original_price?: number | null;
  volume?: string | null;
  key_ingredients?: string[];
  benefits?: string[];
  target_audience?: string[];
  image_url?: string | null;
  product_url?: string | null;
  is_on_sale?: boolean | null;
  is_featured?: boolean | null;
  ai_profile?: {
    whatItDoes?: string;
    sellingPoints?: string[];
    bestFor?: string[];
    promo_percent?: number | null;
    key_ingredients_detailed?: { name: string; note: string | null }[];
  } | null;
}

interface IngredientSuggestion {
  name: string;
  count: number;
  sample_note?: string;
}

interface Props {
  username: string;
  accountId: string;
  products: DekelProduct[];
  onAskAbout: (question: string, hiddenContext?: string) => void;
}

// Abbreviated, neutral labels — no emoji on chips so the row reads calm.
const PRIMARY_CLAIM_FILTERS: { value: string; label: string }[] = [
  { value: 'מאושר בהיריון / הנקה', label: 'הריון והנקה' },
  { value: 'נבדק לעור רגיש', label: 'עור רגיש' },
  { value: 'ללא פרבנים', label: 'ללא פרבנים' },
  { value: 'ללא בישום', label: 'ללא בישום' },
  { value: 'ללא אלכוהול מייבש', label: 'ללא אלכוהול' },
  { value: 'מיוצר בישראל', label: 'תוצרת ישראל' },
  { value: 'לא מעלה את רגישות העור לשמש', label: 'יום יומי בשמש' },
];

function brandShortName(brand?: string | null): string {
  if (!brand) return '';
  return brand.split('|')[0].trim();
}

function buildProductContext(p: DekelProduct): string {
  const parts: string[] = [];
  parts.push(`[שם המוצר: ${p.name_he || p.name}]`);
  if (p.brand) parts.push(`[מותג: ${p.brand}]`);
  if (p.category) parts.push(`[קטגוריה: ${p.category}]`);
  if (p.claims?.length) parts.push(`[תגיות: ${p.claims.join(', ')}]`);
  if (p.description) parts.push(`[תיאור: ${p.description.slice(0, 1500)}]`);
  const detailed = p.ai_profile?.key_ingredients_detailed?.slice(0, 12);
  if (detailed?.length) {
    parts.push(
      `[רכיבי מפתח: ${detailed.map((k) => (k.note ? `${k.name} — ${k.note}` : k.name)).join('; ')}]`
    );
  } else if (p.key_ingredients?.length) {
    parts.push(`[מרכיבים: ${p.key_ingredients.join(', ')}]`);
  }
  if (p.usage) parts.push(`[אופן שימוש: ${p.usage}]`);
  if (p.product_url) parts.push(`[לינק לסקירה המלאה: ${p.product_url}]`);
  return parts.join('\n');
}

// ============================================================================
// Smart-search dropdown helper
// ============================================================================

interface DropdownGroup {
  ingredients: IngredientSuggestion[];
  products: DekelProduct[];
  brands: { name: string; count: number }[];
}

function useDropdownResults(
  query: string,
  products: DekelProduct[],
  ingredients: IngredientSuggestion[]
): DropdownGroup {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { ingredients: [], products: [], brands: [] };

    const ingMatches = ingredients
      .filter((i) => i.name.toLowerCase().includes(q))
      .slice(0, 5);

    const prodMatches = products
      .filter((p) => (p.name_he || p.name || '').toLowerCase().includes(q))
      .slice(0, 5);

    const brandSeen = new Set<string>();
    const brandMatches: { name: string; count: number }[] = [];
    for (const p of products) {
      const b = (p.brand || '').toLowerCase();
      if (!b || brandSeen.has(b)) continue;
      if (b.includes(q)) {
        const count = products.filter((x) => (x.brand || '').toLowerCase() === b).length;
        brandMatches.push({ name: p.brand!, count });
        brandSeen.add(b);
      }
      if (brandMatches.length >= 3) break;
    }

    return { ingredients: ingMatches, products: prodMatches, brands: brandMatches };
  }, [query, products, ingredients]);
}

// ============================================================================
// Detail bottom-sheet
// ============================================================================

function ProductSheet({
  product,
  dictionary,
  onClose,
  onAskAbout,
}: {
  product: DekelProduct;
  dictionary: Record<string, IngredientInfo>;
  onClose: () => void;
  onAskAbout: (q: string, hiddenContext?: string) => void;
}) {
  const displayName = product.name_he || product.name;
  const detailed = product.ai_profile?.key_ingredients_detailed || [];
  const fallbackKey = product.key_ingredients || [];
  const inci = product.ingredients || [];
  const claims = product.claims || [];
  const matchedClaims = PRIMARY_CLAIM_FILTERS.filter((f) => claims.includes(f.value));
  const otherClaims = claims.filter((c) => !PRIMARY_CLAIM_FILTERS.some((f) => f.value === c));
  const promoPercent = product.ai_profile?.promo_percent;
  const [showFullInci, setShowFullInci] = useState(false);

  // Derive "actives" from the INCI list when we don't have Dekel's authored
  // bullets. We use the global ingredient dictionary: anything rated "מעולה"
  // or "טוב" with a function listed is an active ingredient — that's the
  // editorial signal Dekel uses on her own site.
  const derivedActives = useMemo(() => {
    if (detailed.length > 0) return null; // prefer authored data
    if (!inci.length) return null;
    const out: { name: string; note: string | null }[] = [];
    for (const name of inci) {
      const info = dictionary[name];
      if (!info) continue;
      if (info.rating === 'מעולה' || info.rating === 'טוב') {
        out.push({ name, note: info.function || null });
      }
      if (out.length >= 12) break;
    }
    return out.length > 0 ? out : null;
  }, [detailed.length, inci, dictionary]);

  // ESC closes the sheet on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while the sheet is open so the page underneath can't
  // scroll along with the sheet content. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="dpc-sheet-wrap"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        // Drag-down to dismiss — natural mobile gesture, the bar at the top of
        // the sheet acts as the visible affordance.
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          // Either velocity or distance can trigger dismissal
          if (info.offset.y > 140 || info.velocity.y > 600) onClose();
        }}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="dpc-sheet"
      >
        {/* Sticky header — keeps a tap-target close affordance always visible */}
        <header className="dpc-sheet__topbar">
          <div className="dpc-sheet__handle" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="dpc-sheet__close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="dpc-sheet__scroll">
          {product.image_url && (
            <div className="dpc-sheet__hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image_url} alt={displayName} />
              {promoPercent && <span className="dpc-sheet__promo">{promoPercent}% הנחה</span>}
            </div>
          )}

          {product.brand && <div className="dpc-sheet__brand">{brandShortName(product.brand)}</div>}
          <h2 className="dpc-sheet__name">{displayName}</h2>
          {product.category && <div className="dpc-sheet__cat">{product.category}</div>}

          {matchedClaims.length > 0 && (
            <div className="dpc-sheet__claims">
              {matchedClaims.map((c) => (
                <span key={c.value} className="dpc-sheet__claim">{c.label}</span>
              ))}
            </div>
          )}

          {product.description && <p className="dpc-sheet__desc">{product.description}</p>}

          {detailed.length > 0 ? (
            <section className="dpc-sheet__section">
              <h3 className="dpc-sheet__section-title">
                <Beaker className="w-3.5 h-3.5" />
                חומרים פעילים
              </h3>
              <ul className="dpc-sheet__ing-list">
                {detailed.slice(0, 25).map((ing, i) => (
                  <li key={i} className="dpc-sheet__ing">
                    <div className="dpc-sheet__ing-name">{ing.name}</div>
                    {ing.note && <div className="dpc-sheet__ing-note">{ing.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          ) : derivedActives && derivedActives.length > 0 ? (
            <section className="dpc-sheet__section">
              <h3 className="dpc-sheet__section-title">
                <Beaker className="w-3.5 h-3.5" />
                חומרים פעילים
              </h3>
              <ul className="dpc-sheet__ing-list">
                {derivedActives.map((ing, i) => (
                  <li key={i} className="dpc-sheet__ing">
                    <div className="dpc-sheet__ing-name">{ing.name}</div>
                    {ing.note && <div className="dpc-sheet__ing-note">{ing.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          ) : fallbackKey.length > 0 ? (
            <section className="dpc-sheet__section">
              <h3 className="dpc-sheet__section-title">
                <Beaker className="w-3.5 h-3.5" />
                חומרים פעילים
              </h3>
              <div className="dpc-sheet__chip-row">
                {fallbackKey.map((ing, i) => (
                  <span key={i} className="dpc-sheet__chip-neutral">{ing}</span>
                ))}
              </div>
            </section>
          ) : null}

          {otherClaims.length > 0 && (
            <section className="dpc-sheet__section">
              <h3 className="dpc-sheet__section-title">תגיות נוספות</h3>
              <div className="dpc-sheet__chip-row">
                {otherClaims.map((c, i) => (
                  <span key={i} className="dpc-sheet__chip-neutral">{c}</span>
                ))}
              </div>
            </section>
          )}

          {product.usage && (
            <section className="dpc-sheet__section">
              <h3 className="dpc-sheet__section-title">
                <Sparkles className="w-3.5 h-3.5" />
                אופן השימוש
              </h3>
              <p className="dpc-sheet__usage">{product.usage}</p>
            </section>
          )}

          {inci.length > 0 && (
            <section className="dpc-sheet__section">
              <button
                type="button"
                onClick={() => setShowFullInci((v) => !v)}
                className="dpc-sheet__inci-toggle"
              >
                {showFullInci
                  ? 'הסתירי רשימת רכיבים מלאה'
                  : `רשימת רכיבים מלאה (INCI) — ${inci.length}`}
              </button>
              {showFullInci && (
                <div style={{ marginTop: 10 }}>
                  <InciList items={inci} />
                </div>
              )}
            </section>
          )}
        </div>

        <div className="dpc-sheet__actions">
          {product.product_url && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="dpc-sheet__btn dpc-sheet__btn--secondary"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              סקירה מלאה
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              track('product_card_clicked', {
                product_id: product.id,
                product_name: product.name,
                placement: 'sheet_ask',
              });
              onAskAbout(`ספרו לי על ${displayName}`, buildProductContext(product));
              onClose();
            }}
            className="dpc-sheet__btn dpc-sheet__btn--primary"
          >
            שאלו על המוצר
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function DekelProductsCatalog({ username, accountId, products, onAskAbout }: Props) {
  const [search, setSearch] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [activeClaim, setActiveClaim] = useState<string | null>(null);
  const [activeIngredient, setActiveIngredient] = useState<string | null>(null);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [selected, setSelected] = useState<DekelProduct | null>(null);
  const [ingredients, setIngredients] = useState<IngredientSuggestion[]>([]);
  const [dictionary, setDictionary] = useState<Record<string, IngredientInfo>>({});
  const [mounted, setMounted] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ingRes, dictRes] = await Promise.all([
          fetch(`/api/influencer/products/ingredients?username=${username}`),
          fetch(`/api/influencer/products/dictionary?username=${username}`),
        ]);
        if (ingRes.ok) {
          const data = await ingRes.json();
          if (!cancelled) setIngredients(data.ingredients || []);
        }
        if (dictRes.ok) {
          const data = await dictRes.json();
          if (!cancelled) setDictionary(data.dictionary || {});
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!searchFocus) return;
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocus(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [searchFocus]);

  const claimAvailability = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      for (const c of p.claims || []) m.set(c, (m.get(c) || 0) + 1);
    }
    return m;
  }, [products]);

  const dropdown = useDropdownResults(search, products, ingredients);

  const filtered = useMemo(() => {
    const ingLower = activeIngredient?.toLowerCase();
    const brandLower = activeBrand?.toLowerCase();
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeClaim && !(p.claims || []).includes(activeClaim)) return false;
      if (ingLower) {
        const allIngs = [
          ...(p.ingredients || []),
          ...(p.key_ingredients || []),
          ...(p.ai_profile?.key_ingredients_detailed || []).map((k) => k.name),
        ]
          .map((s) => s.toLowerCase())
          .join('|');
        if (!allIngs.includes(ingLower)) return false;
      }
      if (brandLower && (p.brand || '').toLowerCase() !== brandLower) return false;
      if (q && !ingLower && !brandLower) {
        const hay = [
          p.name_he || '',
          p.name || '',
          p.brand || '',
          p.description || '',
          ...(p.ingredients || []),
          ...(p.key_ingredients || []),
          ...(p.ai_profile?.key_ingredients_detailed || []).map((k) => `${k.name} ${k.note || ''}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, activeIngredient, activeBrand, activeClaim]);

  const clearSmartFilter = () => {
    setSearch('');
    setActiveIngredient(null);
    setActiveBrand(null);
    setSearchFocus(false);
  };

  const pickIngredient = (name: string) => {
    track('product_claim_filter', { kind: 'ingredient', value: name });
    setActiveIngredient(name);
    setActiveBrand(null);
    setSearch('');
    setSearchFocus(false);
  };

  const pickBrand = (name: string) => {
    track('product_claim_filter', { kind: 'brand', value: name });
    setActiveBrand(name);
    setActiveIngredient(null);
    setSearch('');
    setSearchFocus(false);
  };

  const onCardClick = (p: DekelProduct) => {
    track('product_card_clicked', { product_id: p.id, product_name: p.name, placement: 'grid' });
    setSelected(p);
  };

  const totalUnfiltered = products.length;
  const hasFilters = !!(activeClaim || activeIngredient || activeBrand || search.trim());

  // All brands with product counts — fed to the brand picker sheet.
  const brandList = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const b = (p.brand || '').trim();
      if (!b) continue;
      map.set(b, (map.get(b) || 0) + 1);
    }
    return [...map.entries()]
      .map(([brand, count]) => ({ brand, count, shortName: brandShortName(brand) }))
      .sort((a, b) => a.shortName.localeCompare(b.shortName, 'he'));
  }, [products]);

  // Sort the result set alphabetically by brand → product name. Visually this
  // means same-brand products cluster naturally without explicit section headers.
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ba = brandShortName(a.brand);
      const bb = brandShortName(b.brand);
      const c = ba.localeCompare(bb, 'he');
      if (c !== 0) return c;
      return (a.name_he || a.name || '').localeCompare(b.name_he || b.name || '', 'he');
    });
  }, [filtered]);

  const [brandPickerOpen, setBrandPickerOpen] = useState(false);

  return (
    <IngredientDictProvider dictionary={dictionary}>
    <div className="dpc" dir="rtl">
      <div className="dpc-inner">
        {/* Sticky search */}
        <div ref={searchRef} className="dpc-search-wrap">
          <div className={`dpc-search ${searchFocus ? 'dpc-search--focus' : ''}`}>
            <Search className="dpc-search__icon" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchFocus(true);
              }}
              onFocus={() => setSearchFocus(true)}
              placeholder="חפשי תכשיר, רכיב או מותג"
              className="dpc-search__input"
            />
            {(search || activeIngredient || activeBrand) && (
              <button
                type="button"
                onClick={clearSmartFilter}
                aria-label="נקה"
                className="dpc-search__clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <AnimatePresence>
            {searchFocus &&
              search &&
              dropdown.ingredients.length + dropdown.products.length + dropdown.brands.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="dpc-dropdown"
                >
                  {dropdown.ingredients.length > 0 && (
                    <div className="dpc-dropdown__group">
                      <div className="dpc-dropdown__heading">רכיבים</div>
                      {dropdown.ingredients.map((i) => (
                        <button
                          key={i.name}
                          type="button"
                          onClick={() => pickIngredient(i.name)}
                          className="dpc-dropdown__row"
                        >
                          <span className="dpc-dropdown__row-name">{i.name}</span>
                          <span className="dpc-dropdown__row-meta">{i.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {dropdown.brands.length > 0 && (
                    <div className="dpc-dropdown__group">
                      <div className="dpc-dropdown__heading">מותגים</div>
                      {dropdown.brands.map((b) => (
                        <button
                          key={b.name}
                          type="button"
                          onClick={() => pickBrand(b.name)}
                          className="dpc-dropdown__row"
                        >
                          <span className="dpc-dropdown__row-name">{b.name}</span>
                          <span className="dpc-dropdown__row-meta">{b.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {dropdown.products.length > 0 && (
                    <div className="dpc-dropdown__group">
                      <div className="dpc-dropdown__heading">תכשירים</div>
                      {dropdown.products.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onCardClick(p);
                            setSearchFocus(false);
                          }}
                          className="dpc-dropdown__row"
                        >
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt="" className="dpc-dropdown__thumb" />
                          ) : (
                            <span className="dpc-dropdown__thumb dpc-dropdown__thumb--ph" aria-hidden />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="dpc-dropdown__row-name">{p.name_he || p.name}</div>
                            {p.brand && <div className="dpc-dropdown__row-sub">{brandShortName(p.brand)}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
          </AnimatePresence>
        </div>

        {/* Chip row — brand picker first, then active filter pills, then claim chips */}
        <div className="dpc-chips" role="tablist" aria-label="סינון">
          <button
            type="button"
            onClick={() => setBrandPickerOpen(true)}
            className={`dpc-chip dpc-chip--accent ${activeBrand ? 'dpc-chip--active' : ''}`}
            aria-haspopup="dialog"
          >
            <span>{activeBrand ? brandShortName(activeBrand) : 'כל המותגים'}</span>
            {!activeBrand && <span className="dpc-chip__count">{brandList.length}</span>}
            <ChevronDown className="w-3.5 h-3.5" style={{ marginInlineStart: 2 }} />
          </button>
          {activeIngredient && (
            <span className="dpc-active-pill">
              {activeIngredient}
              <button
                type="button"
                onClick={clearSmartFilter}
                aria-label="נקה סינון"
                className="dpc-active-pill__close"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {PRIMARY_CLAIM_FILTERS.filter((f) => claimAvailability.has(f.value)).map((f) => {
            const isActive = activeClaim === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  track('product_claim_filter', { kind: 'claim', value: isActive ? null : f.value });
                  setActiveClaim(isActive ? null : f.value);
                }}
                className={`dpc-chip ${isActive ? 'dpc-chip--active' : ''}`}
                role="tab"
                aria-selected={isActive}
              >
                <span>{f.label}</span>
                <span className="dpc-chip__count">{claimAvailability.get(f.value)}</span>
              </button>
            );
          })}
        </div>

        <div className="dpc-summary">
          {hasFilters
            ? `${filtered.length} מתוך ${totalUnfiltered.toLocaleString('he-IL')} תכשירים`
            : `${totalUnfiltered.toLocaleString('he-IL')} תכשירים · ${brandList.length} מותגים`}
        </div>

        {sortedFiltered.length === 0 ? (
          <div className="dpc-empty">
            <p>לא נמצאו תכשירים תואמים</p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setActiveClaim(null);
                  clearSmartFilter();
                }}
                className="dpc-empty__reset"
              >
                נקי את הסינון
              </button>
            )}
          </div>
        ) : (
          <div className="dpc-grid">
            {sortedFiltered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                showDot={!!activeClaim && (p.claims || []).includes(activeClaim)}
                onClick={() => onCardClick(p)}
              />
            ))}
          </div>
        )}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {selected && (
              <IngredientDictProvider dictionary={dictionary}>
                <ProductSheet
                  product={selected}
                  dictionary={dictionary}
                  onClose={() => setSelected(null)}
                  onAskAbout={onAskAbout}
                />
              </IngredientDictProvider>
            )}
          </AnimatePresence>,
          document.body
        )}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {brandPickerOpen && (
              <BrandPicker
                brands={brandList}
                active={activeBrand}
                onPick={(b) => {
                  if (b === activeBrand) {
                    setActiveBrand(null);
                  } else {
                    setActiveBrand(b);
                    setActiveIngredient(null);
                    setSearch('');
                  }
                  track('product_claim_filter', { kind: 'brand', value: b });
                  setBrandPickerOpen(false);
                }}
                onClose={() => setBrandPickerOpen(false)}
              />
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
    </IngredientDictProvider>
  );
}

// ============================================================================
// Brand picker — bottom-sheet with searchable list of brands
// ============================================================================

function BrandPicker({
  brands,
  active,
  onPick,
  onClose,
}: {
  brands: { brand: string; count: number; shortName: string }[];
  active: string | null;
  onPick: (brand: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return brands;
    return brands.filter((b) => b.brand.toLowerCase().includes(needle));
  }, [brands, q]);

  // ESC + body lock — same UX contract as the product sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="dpc-bp-wrap"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 140 || info.velocity.y > 600) onClose();
        }}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="dpc-bp"
      >
        <div className="dpc-bp__topbar">
          <span className="dpc-bp__title">בחירת מותג</span>
          <button type="button" className="dpc-bp__close" aria-label="סגירה" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="dpc-bp__search">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש מותג…"
            className="dpc-bp__search-input"
            autoFocus
          />
        </div>
        <ul className="dpc-bp__list">
          <li>
            <button
              type="button"
              className={`dpc-bp__row ${!active ? 'dpc-bp__row--active' : ''}`}
              onClick={() => {
                onPick(null);
              }}
            >
              <span className="dpc-bp__row-name">כל המותגים</span>
              <span className="dpc-bp__row-count">
                {brands.reduce((s, b) => s + b.count, 0)}
              </span>
              {!active && (
                <span className="dpc-bp__row-check">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          </li>
          {filtered.map((b) => {
            const isActive = b.brand === active;
            return (
              <li key={b.brand}>
                <button
                  type="button"
                  className={`dpc-bp__row ${isActive ? 'dpc-bp__row--active' : ''}`}
                  onClick={() => onPick(b.brand)}
                >
                  <span className="dpc-bp__row-name">{b.shortName}</span>
                  <span className="dpc-bp__row-count">{b.count}</span>
                  {isActive && (
                    <span className="dpc-bp__row-check">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li
              style={{ padding: '40px 12px', textAlign: 'center', color: '#6b6357', fontSize: 13 }}
            >
              לא נמצא מותג בשם "{q}"
            </li>
          )}
        </ul>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// Card
// ============================================================================

function ProductCard({
  product,
  showDot,
  hideBrand,
  onClick,
}: {
  product: DekelProduct;
  showDot?: boolean;
  /** Hide the brand line — used inside brand-grouped sections where the section
   *  header already establishes the brand. */
  hideBrand?: boolean;
  onClick: () => void;
}) {
  const displayName = product.name_he || product.name;
  return (
    <button type="button" onClick={onClick} className="dpc-card" aria-label={`${displayName} — לפרטים`}>
      <div className={`dpc-card__media ${product.image_url ? '' : 'dpc-card__media--placeholder'}`}>
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={displayName} loading="lazy" className="dpc-card__img" />
        ) : (
          <Sparkles className="w-8 h-8" style={{ color: '#bcb39e', opacity: 0.6 }} />
        )}
        {showDot && <span className="dpc-card__dot" aria-hidden />}
      </div>
      <div className="dpc-card__body">
        {!hideBrand && product.brand && (
          <div className="dpc-card__brand">{brandShortName(product.brand)}</div>
        )}
        <div className="dpc-card__name">{displayName}</div>
      </div>
    </button>
  );
}
