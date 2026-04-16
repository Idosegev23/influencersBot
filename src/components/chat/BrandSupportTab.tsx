'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, CheckCircle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  name: string;
  name_he?: string;
  description?: string;
  price?: number;
  category?: string;
  subcategory?: string;
  product_line?: string;
  image_url?: string;
  product_url?: string;
}

interface Coupon {
  brand_name: string;
  coupon_code: string | null;
  description: string | null;
  discount_percent?: number;
  category: string | null;
}

interface BrandSupportTabProps {
  accountId: string;
  username: string;
  brandName: string;
  isMobile: boolean;
  coupons?: Coupon[];
}

/* ------------------------------------------------------------------ */
/*  Problem categories                                                 */
/* ------------------------------------------------------------------ */

const PROBLEM_TYPES = [
  { id: 'damaged', label: 'מוצר פגום', sublabel: 'הגיע שבור או ניזוק', icon: 'problem-damaged' },
  { id: 'wrong_item', label: 'מוצר שגוי', sublabel: 'קיבלתי מוצר אחר', icon: 'problem-wrong' },
  { id: 'shipping', label: 'בעיית משלוח', sublabel: 'לא הגיע / איחר', icon: 'problem-shipping' },
  { id: 'coupon', label: 'בעיה בקופון', sublabel: 'קוד לא עובד', icon: 'problem-coupon' },
  { id: 'payment', label: 'בעיה בתשלום', sublabel: 'חיוב כפול / שגיאה', icon: 'problem-payment' },
  { id: 'quality', label: 'איכות מוצר', sublabel: 'לא מתאים לציפיות', icon: 'problem-quality' },
  { id: 'other', label: 'אחר', sublabel: 'פנייה כללית', icon: 'problem-other' },
] as const;

type ProblemTypeId = typeof PROBLEM_TYPES[number]['id'];

const CATEGORY_LABELS: Record<string, string> = {
  hair_care: 'טיפוח שיער', face_care: 'טיפוח פנים', body_care: 'טיפוח גוף',
  makeup: 'איפור', fragrance: 'בשמים', skincare: 'טיפוח עור',
  food: 'אוכל', spices: 'תבלינים', paint: 'צבעים',
  tools: 'כלים', service: 'שירותים', general: 'כללי', other: 'אחר',
  lips: 'טיפוח שפתיים', lip_care: 'טיפוח שפתיים',
  accessories: 'אקססוריז', sets: 'סטים', men: 'לגבר',
  nails: 'ציפורניים', sun: 'הגנה מהשמש', eyes: 'עיניים',
};

/* ── Category → Figma icon filename (matches public/icons/categories) ── */
const CATEGORY_ICON: Record<string, string> = {
  hair_care: 'hairbrush',
  face_care: 'cream',
  body_care: 'sunscreen',
  skincare: 'cream',
  makeup: 'blush',
  lips: 'lipstick',
  lip_care: 'lipstick',
  eyes: 'mascara',
  nails: 'manicure',
  sun: 'sunscreen',
  fragrance: 'air-freshener',
  accessories: 'hat-beach',
  sets: 'diamond',
  men: 'hair-clipper',
  tools: 'hair-clipper',
  service: 'beacon',
};
function iconFor(cat: string): string {
  return CATEGORY_ICON[cat] || 'product';
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function BrandSupportTab({
  accountId, username, brandName, isMobile, coupons = [],
}: BrandSupportTabProps) {
  const [step, setStep] = useState<'product' | 'type' | 'form' | 'success'>('product');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Selected state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedType, setSelectedType] = useState<ProblemTypeId | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

  // Form
  const [form, setForm] = useState({ name: '', phone: '', order: '', details: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch products
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

  // Filter products
  const filtered = useMemo(() => {
    if (!searchQuery) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(p =>
      (p.name_he || p.name || '').toLowerCase().includes(q) ||
      (p.product_line || '').toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  // Group products by category for accordion view
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const cat = p.category || 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const useCategories = products.length > 15 && !searchQuery;

  // Visible problem types — show 'coupon' only if there are coupons
  const visibleTypes = useMemo(() => {
    if (coupons.length === 0) return PROBLEM_TYPES.filter(t => t.id !== 'coupon');
    return PROBLEM_TYPES;
  }, [coupons]);

  // Auto-select coupon if only one
  const handleCouponTypeSelect = () => {
    setSelectedType('coupon');
    if (coupons.length === 1) {
      setSelectedCoupon(coupons[0]);
    }
    setStep('form');
  };

  // Submit
  const handleSubmit = async () => {
    if (!form.name || !form.phone || !form.details) {
      setError('נא למלא את כל השדות החובה');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Build detailed problem message with context
      const parts: string[] = [];
      if (selectedProduct) {
        parts.push(`מוצר: ${selectedProduct.name_he || selectedProduct.name}`);
        if (selectedProduct.product_url) parts.push(`קישור: ${selectedProduct.product_url}`);
      }
      const typeLabel = PROBLEM_TYPES.find(t => t.id === selectedType)?.label || 'אחר';
      parts.push(`סוג בעיה: ${typeLabel}`);
      if (selectedCoupon) {
        parts.push(`קופון: ${selectedCoupon.coupon_code} (${selectedCoupon.brand_name})`);
      }
      parts.push(`פירוט: ${form.details}`);

      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          brand: brandName,
          customerName: form.name,
          customerPhone: form.phone,
          orderNumber: form.order || null,
          problem: parts.join('\n'),
          productId: selectedProduct?.id || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'שגיאה בשליחת הפנייה');
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת הפנייה');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep('product');
    setSelectedProduct(null);
    setSelectedType(null);
    setSelectedCoupon(null);
    setForm({ name: '', phone: '', order: '', details: '' });
    setError(null);
    setSearchQuery('');
    setExpandedCategory(null);
  };

  const goBack = () => {
    if (step === 'form') { setStep('type'); setError(null); }
    else if (step === 'type') { setStep('product'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary, #7c3aed)' }} />
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${isMobile ? 'pb-32' : 'pb-8'}`} dir="rtl">
      <div className="px-4 py-6">
        <div className={`mx-auto ${isMobile ? 'max-w-2xl' : 'max-w-[700px]'}`}>
          <AnimatePresence mode="wait">

            {/* ======== STEP 1: Select Product (Figma 346:4206) ======== */}
            {step === 'product' && (
              <motion.div
                key="support-product"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="mb-4 px-3">
                  <h2 className="support-title">בעיה במוצר</h2>
                  <p className="support-subtitle">על איזה מוצר תרצו לדווח?</p>
                </div>

                {/* Search pill */}
                {products.length > 6 && (
                  <div className="support-search mb-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="חיפוש מוצר"
                      dir="rtl"
                    />
                    <span className="support-search-icon" aria-hidden />
                  </div>
                )}

                {/* "General" option */}
                <button
                  onClick={() => { setSelectedProduct(null); setStep('type'); }}
                  className="support-card mb-2"
                >
                  <div className="support-card-icon-avatar">
                    <span
                      className="support-icon"
                      style={{
                        WebkitMaskImage: "url('/icons/categories/product.svg')",
                        maskImage: "url('/icons/categories/product.svg')",
                      }}
                      aria-hidden
                    />
                  </div>
                  <div className="support-card-text">
                    <p className="support-card-title">פנייה כללית</p>
                    <p className="support-card-subtitle">ללא מוצר ספציפי</p>
                  </div>
                </button>

                {/* Product list — alphabet sub-list when category open, else categories */}
                {useCategories ? (
                  <div className="flex flex-col gap-2">
                    {groupedByCategory.map(([cat, items]) => {
                      const isOpen = expandedCategory === cat;
                      const iconName = iconFor(cat);
                      return (
                        <div key={cat}>
                          <button
                            onClick={() => setExpandedCategory(isOpen ? null : cat)}
                            className={`support-card${isOpen ? ' is-open' : ''}`}
                          >
                            <div className="support-card-icon-avatar">
                              <span
                                className="support-icon"
                                style={{
                                  WebkitMaskImage: `url('/icons/categories/${iconName}.svg')`,
                                  maskImage: `url('/icons/categories/${iconName}.svg')`,
                                }}
                                aria-hidden
                              />
                            </div>
                            <div className="support-card-text">
                              <p className="support-card-title">
                                {CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')}
                              </p>
                              <p className="support-card-subtitle">{items.length} מוצרים</p>
                            </div>
                          </button>
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="flex flex-col gap-2 mt-2 mb-2">
                                  {items.map(product => {
                                    const rawName = product.name_he || product.name || '';
                                    const letter = rawName.trim().charAt(0).toUpperCase();
                                    return (
                                      <button
                                        key={product.id}
                                        onClick={() => { setSelectedProduct(product); setStep('type'); }}
                                        className="support-card"
                                      >
                                        {product.image_url ? (
                                          <img
                                            src={product.image_url}
                                            alt=""
                                            className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                                          />
                                        ) : (
                                          <div className="support-letter-avatar">{letter}</div>
                                        )}
                                        <div className="support-card-text">
                                          <p className="support-card-title">{rawName}</p>
                                          {product.product_line && (
                                            <p className="support-card-subtitle">{product.product_line}</p>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Flat product list when few products or searching */
                  <div className="flex flex-col gap-2">
                    {filtered.map(product => {
                      const rawName = product.name_he || product.name || '';
                      const letter = rawName.trim().charAt(0).toUpperCase();
                      return (
                        <button
                          key={product.id}
                          onClick={() => { setSelectedProduct(product); setStep('type'); }}
                          className="support-card"
                        >
                          <div className="support-card-text">
                            <p className="support-card-title">{rawName}</p>
                            {product.product_line && (
                              <p className="support-card-subtitle">{product.product_line}</p>
                            )}
                          </div>
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="support-letter-avatar">{letter}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {filtered.length === 0 && searchQuery && (
                  <p className="text-center text-sm mt-6" style={{ color: '#999' }}>לא נמצאו מוצרים</p>
                )}
              </motion.div>
            )}

            {/* ======== STEP 2: Problem Type (Figma 403:1953) ======== */}
            {step === 'type' && (
              <motion.div
                key="support-type"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="mb-4 px-3 flex items-start justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('product')}
                    className="support-back-btn"
                    aria-label="חזרה"
                  >
                    <span className="support-back-icon" aria-hidden />
                  </button>
                  <div>
                    <h2 className="support-title">מה הבעיה?</h2>
                    <p className="support-subtitle">בחרי את הבעיה שנתקלת בה</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Selected product pill */}
                  {selectedProduct && (
                    <div className="selected-product-pill">
                      {selectedProduct.image_url ? (
                        <img src={selectedProduct.image_url} alt="" />
                      ) : (
                        <div className="support-letter-avatar" style={{ width: 44, height: 44, borderRadius: 37 }}>
                          {(selectedProduct.name_he || selectedProduct.name || '').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p>{selectedProduct.name_he || selectedProduct.name}</p>
                    </div>
                  )}

                  {/* Problem type grid — 2 columns */}
                  <div className="problem-type-grid">
                    {visibleTypes.map(type => (
                      <button
                        key={type.id}
                        onClick={() => {
                          if (type.id === 'coupon') {
                            handleCouponTypeSelect();
                          } else {
                            setSelectedType(type.id);
                            setStep('form');
                          }
                        }}
                        className="problem-type-card"
                      >
                        <div className="problem-type-icon">
                          <span
                            className="support-icon"
                            style={{
                              WebkitMaskImage: `url('/icons/categories/${type.icon}.svg')`,
                              maskImage: `url('/icons/categories/${type.icon}.svg')`,
                            }}
                            aria-hidden
                          />
                        </div>
                        <div className="problem-type-text">
                          <p>{type.label}</p>
                          <p>{type.sublabel}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ======== STEP 3: Form ======== */}
            {step === 'form' && (
              <motion.div
                key="support-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="mb-4 px-3 flex items-start justify-between">
                  <button
                    type="button"
                    onClick={goBack}
                    className="support-back-btn"
                    aria-label="חזרה"
                  >
                    <span className="support-back-icon" aria-hidden />
                  </button>
                  <div>
                    <h2 className="support-title">פתיחת פנייה</h2>
                    <p className="support-subtitle">מלאו את הפרטים ונחזור אליכם בהקדם</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mb-3">
                  {/* Selected product speech-bubble pill */}
                  {selectedProduct && (
                    <div className="selected-product-pill">
                      {selectedProduct.image_url ? (
                        <img src={selectedProduct.image_url} alt="" />
                      ) : (
                        <div className="support-letter-avatar" style={{ width: 44, height: 44, borderRadius: 37 }}>
                          {(selectedProduct.name_he || selectedProduct.name || '').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p>{selectedProduct.name_he || selectedProduct.name}</p>
                    </div>
                  )}

                  {/* Selected problem type pill */}
                  {selectedType && (
                    <div className="selected-product-pill" style={{ background: 'rgba(241,233,253,0.5)' }}>
                      <div className="problem-type-icon" style={{ width: 36, height: 36, borderRadius: 8 }}>
                        <span
                          className="support-icon"
                          style={{
                            WebkitMaskImage: `url('/icons/categories/${PROBLEM_TYPES.find(t => t.id === selectedType)?.icon || 'problem-other'}.svg')`,
                            maskImage: `url('/icons/categories/${PROBLEM_TYPES.find(t => t.id === selectedType)?.icon || 'problem-other'}.svg')`,
                          }}
                          aria-hidden
                        />
                      </div>
                      <p>{PROBLEM_TYPES.find(t => t.id === selectedType)?.label}</p>
                    </div>
                  )}

                  {/* Coupon selector (if type is coupon and multiple coupons) */}
                  {selectedType === 'coupon' && coupons.length > 1 && !selectedCoupon && (
                    <div className="flex flex-col gap-2">
                      {coupons.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedCoupon(c)}
                          className="support-card"
                        >
                          <div className="support-card-icon-avatar" style={{ background: 'rgba(136,63,226,0.08)' }}>
                            <span
                              className="support-icon"
                              style={{
                                WebkitMaskImage: "url('/icons/categories/problem-coupon.svg')",
                                maskImage: "url('/icons/categories/problem-coupon.svg')",
                              }}
                              aria-hidden
                            />
                          </div>
                          <div className="support-card-text">
                            <p className="support-card-title">{c.coupon_code || c.brand_name}</p>
                            {c.description && <p className="support-card-subtitle">{c.description}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCoupon?.coupon_code && (
                    <div className="selected-product-pill" style={{ background: 'rgba(241,233,253,0.5)' }}>
                      <p>🎟️ {selectedCoupon.coupon_code}</p>
                    </div>
                  )}
                </div>

                {/* Form fields — Figma pill inputs */}
                <div className="flex flex-col gap-[6px]">
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="שם מלא"
                    className="support-form-input"
                  />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="מספר טלפון"
                    className="support-form-input"
                  />
                  <input
                    type="text"
                    value={form.order}
                    onChange={e => setForm({ ...form, order: e.target.value })}
                    placeholder="מספר הזמנה (אופציונלי)"
                    className="support-form-input"
                  />
                  <textarea
                    value={form.details}
                    onChange={e => setForm({ ...form, details: e.target.value })}
                    placeholder="תיאור הבעיה"
                    className="support-form-textarea"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !form.name || !form.phone || !form.details}
                  className={`support-cta mt-8 ${submitting || !form.name || !form.phone || !form.details ? 'support-cta--disabled' : 'support-cta--enabled'}`}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שלח פנייה'}
                </button>
              </motion.div>
            )}

            {/* ======== STEP 4: Success ======== */}
            {step === 'success' && (
              <motion.div
                key="support-success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <div className="problem-success-icon">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-[22px] font-bold mb-2" style={{ color: '#1a1a2e' }}>
                  הפנייה נשלחה בהצלחה!
                </h3>
                <p className="text-[15px] mb-8" style={{ color: '#888' }}>
                  צוות {brandName} יחזור אליכם בהקדם
                </p>
                <button onClick={reset} className="problem-btn-submit px-10">
                  סגור
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
