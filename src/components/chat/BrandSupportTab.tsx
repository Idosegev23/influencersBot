'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, CheckCircle, Package, MapPin, Clock, Search, AlertCircle, Truck } from 'lucide-react';

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
  initialDetails?: string;
  enableShipmentTracking?: boolean;
  initialMode?: 'support' | 'tracking';
}

interface ShipmentStatus {
  found: boolean;
  shipmentNumber: string | null;
  statusText: string;
  isDelivered: boolean;
  isCanceled: boolean;
  isReturned: boolean;
  lastUpdate: { date: string | null; time: string | null };
  destinationBranch: string | null;
  shipmentDirection: string | null;
  history: Array<{ desc: string; date: string | null; time: string | null }>;
  errorMessage: string | null;
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
  accountId, username, brandName, isMobile, coupons = [], initialDetails, enableShipmentTracking, initialMode,
}: BrandSupportTabProps) {
  // mode: 'support' = problem report flow (default), 'tracking' = order status lookup
  const [mode, setMode] = useState<'support' | 'tracking'>(initialMode || 'support');

  // External requests to switch mode (e.g. user clicked the persistent
  // CTA "סטטוס משלוחים" while already on the support tab) — re-sync.
  useEffect(() => {
    if (initialMode && initialMode !== mode) setMode(initialMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);
  const [step, setStep] = useState<'product' | 'type' | 'form' | 'success'>('product');

  // Tracking sub-flow state
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<ShipmentStatus | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  // Two-mode lookup:
  //   'order'    — customer enters their order number (P2). Valid only
  //                when the value is ≥ 8 digits and has NO `#`. Old
  //                6-digit orders collide with other customers' ship_no
  //                ranges at Focus, so we require new 8-digit format
  //                (10000000+) to avoid cross-customer collisions.
  //   'shipment' — customer enters the Focus shipment number (P1).
  //                Triggered when the order number has `#` or is too
  //                short to search reliably.
  const [trackingMode, setTrackingMode] = useState<'order' | 'shipment'>('order');
  const MIN_ORDER_DIGITS = 8;

  const lookupShipment = useCallback(async () => {
    const raw = trackingNumber.trim();
    if (!raw) {
      setTrackingError(trackingMode === 'order' ? 'נא להזין מספר הזמנה' : 'נא להזין מספר משלוח');
      return;
    }

    if (trackingMode === 'order') {
      // Order-number mode — validate that it can actually be searched
      // through Focus's API. Two cases force a fallback to shipment
      // number:
      //   • contains '#' (legacy orders) — Focus's URL parser breaks
      //     when sent with #, and stripping it returns wrong shipments
      //   • shorter than MIN_ORDER_DIGITS — too generic, returns the
      //     wrong customer's record
      const hasHash = raw.includes('#');
      const digitsOnly = raw.replace(/[^0-9]/g, '');
      if (hasHash || digitsOnly.length < MIN_ORDER_DIGITS) {
        const reason = hasHash
          ? 'לא ניתן לחפש לפי מספר הזמנה ישנה (כולל #). הזיני בבקשה את מספר המשלוח שקיבלת מ-Focus במייל.'
          : `המספר קצר מדי (פחות מ-${MIN_ORDER_DIGITS} ספרות). זה כנראה מספר הזמנה ישן. הזיני בבקשה את מספר המשלוח שקיבלת מ-Focus במייל.`;
        setTrackingError(null);
        setTrackingMode('shipment');
        setTrackingNumber('');
        setTrackingStatus(null);
        // Surface the reason via an error chip in the new mode
        setTrackingError(reason);
        return;
      }

      // Send as P2 (reference) — clean order number
      setTrackingLoading(true);
      setTrackingError(null);
      try {
        const res = await fetch(
          `/api/shipment/status?username=${encodeURIComponent(username)}&reference=${encodeURIComponent(digitsOnly)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setTrackingError(data?.error || 'לא ניתן לבצע את הבדיקה כרגע');
          setTrackingStatus(null);
        } else {
          setTrackingStatus(data as ShipmentStatus);
        }
      } catch {
        setTrackingError('אירעה שגיאה בחיבור לשירות המשלוחים');
      } finally {
        setTrackingLoading(false);
      }
      return;
    }

    // Shipment-number mode (P1)
    const cleaned = raw.replace(/^#+/, '').replace(/\s+/g, '');
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const res = await fetch(
        `/api/shipment/status?username=${encodeURIComponent(username)}&shipmentNumber=${encodeURIComponent(cleaned)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setTrackingError(data?.error || 'לא ניתן לבצע את הבדיקה כרגע');
        setTrackingStatus(null);
      } else {
        setTrackingStatus(data as ShipmentStatus);
      }
    } catch {
      setTrackingError('אירעה שגיאה בחיבור לשירות המשלוחים');
    } finally {
      setTrackingLoading(false);
    }
  }, [trackingNumber, trackingMode, username]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Selected state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedType, setSelectedType] = useState<ProblemTypeId | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

  // Form (seed details from a chat-redirect prefill if provided)
  const [form, setForm] = useState({ name: '', phone: '', order: '', details: initialDetails || '' });

  // If a new prefill arrives later (e.g. user complains again from chat),
  // update the details field as long as the user hasn't typed something else.
  useEffect(() => {
    if (initialDetails && !form.details) {
      setForm((f) => ({ ...f, details: initialDetails }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetails]);
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
        <div className={`mx-auto support-flow-container ${isMobile ? 'max-w-2xl' : 'max-w-[700px]'}`}>

          {/* ======== MODE TOGGLE — Figma-style nav pill (rounded-[60px], #883fe2 active) ======== */}
          {enableShipmentTracking && (
            <div className="mb-5 mx-auto bg-white p-[6px] rounded-[60px] flex gap-[6px]" style={{ width: 'fit-content', maxWidth: '100%' }}>
              <button
                type="button"
                onClick={() => { setMode('support'); setTrackingStatus(null); setTrackingError(null); }}
                className="flex items-center gap-[6px] h-[40px] px-[12px] rounded-[60px] transition-colors"
                style={{
                  background: mode === 'support' ? '#883fe2' : 'transparent',
                  color: mode === 'support' ? '#f1e9fd' : '#676767',
                }}
              >
                <AlertCircle className="w-[18px] h-[18px]" strokeWidth={2} />
                <span className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px]">בעיה במוצר</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('tracking')}
                className="flex items-center gap-[6px] h-[40px] px-[12px] rounded-[60px] transition-colors"
                style={{
                  background: mode === 'tracking' ? '#883fe2' : 'transparent',
                  color: mode === 'tracking' ? '#f1e9fd' : '#676767',
                }}
              >
                <Truck className="w-[18px] h-[18px]" strokeWidth={2} />
                <span className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px]">סטטוס משלוח</span>
              </button>
            </div>
          )}

          {/* ======== SHIPMENT TRACKING MODE — Figma-style: solid #883fe2, soft #f1e9fd, no gradients ======== */}
          {mode === 'tracking' && enableShipmentTracking && (
            <motion.div
              key="tracking-flow"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              {/* Header — adapts to mode */}
              <div className="mb-6 px-3 flex flex-col items-end gap-[2px]">
                <h2 className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[24px] leading-[28px] text-[#0c1013] text-right">
                  {trackingMode === 'order' ? 'סטטוס הזמנה' : 'סטטוס משלוח'}
                </h2>
                <p className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[24px] text-[#676767] text-right">
                  {trackingMode === 'order'
                    ? 'הזיני את מספר ההזמנה (מאישור הרכישה)'
                    : 'הזיני את מספר המשלוח שקיבלת במייל מ-Focus'}
                </p>
              </div>

              {/* Mode pill — switchable between order and shipment */}
              <div className="mb-[12px] flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTrackingMode(trackingMode === 'order' ? 'shipment' : 'order');
                    setTrackingError(null);
                    setTrackingStatus(null);
                    setTrackingNumber('');
                  }}
                  className="font-['Heebo:Regular',sans-serif] text-[13px] text-[#883fe2] underline px-2"
                >
                  {trackingMode === 'order' ? 'מעדיפה לחפש לפי מספר משלוח →' : '← חזרה למספר הזמנה'}
                </button>
              </div>

              {/* Lookup card — pill input + solid purple CTA */}
              <div className="flex flex-col gap-[12px] mb-[16px]">
                <div className="bg-white h-[60px] flex items-center px-[20px] rounded-[60px]">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') lookupShipment(); }}
                    placeholder={trackingMode === 'order' ? `מספר הזמנה (${MIN_ORDER_DIGITS}+ ספרות)` : 'מספר משלוח Focus'}
                    className="w-full bg-transparent border-0 outline-none font-['Heebo:Light',sans-serif] font-light text-[18px] leading-[22.4px] text-[#0c1013] placeholder:text-[#676767] text-right"
                    dir="rtl"
                  />
                </div>
                <button
                  type="button"
                  onClick={lookupShipment}
                  disabled={trackingLoading || !trackingNumber.trim()}
                  className="h-[52px] flex items-center justify-center px-[20px] rounded-[60px] transition-opacity active:opacity-90"
                  style={{
                    background: trackingLoading || !trackingNumber.trim() ? '#676767' : '#883fe2',
                    color: '#ffffff',
                  }}
                >
                  {trackingLoading ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                  ) : (
                    <span className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[22.4px]">בדיקת סטטוס</span>
                  )}
                </button>
                {trackingError && (
                  <p className="font-['Heebo:Regular',sans-serif] text-[14px] text-red-600 text-right px-3">
                    {trackingError}
                  </p>
                )}
              </div>

              <AnimatePresence mode="wait">
                {trackingStatus && (
                  <motion.div
                    key={trackingStatus.shipmentNumber || 'not-found'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    {!trackingStatus.found ? (
                      <div className="bg-white rounded-[20px] p-6 text-center">
                        <div className="w-[56px] h-[56px] mx-auto rounded-[14px] flex items-center justify-center mb-4 bg-[#f1e9fd]">
                          <Search className="w-7 h-7 text-[#883fe2]" />
                        </div>
                        <h3 className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[20px] leading-[24px] text-[#0c1013] mb-1">לא נמצא</h3>
                        <p className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px] text-[#676767]">{trackingStatus.statusText}</p>
                      </div>
                    ) : (
                      <>
                        {/* Soft purple chip with status — matches "Always" pill from Figma */}
                        <div
                          className="flex gap-[12px] items-center justify-end px-[18px] py-[16px] rounded-bl-[18px] rounded-tl-[18px] rounded-tr-[18px] mb-[20px]"
                          style={{ background: '#f1e9fd' }}
                        >
                          <p className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[24px] text-[#883fe2] text-right whitespace-nowrap">
                            {trackingStatus.statusText}
                          </p>
                        </div>

                        {/* Status header card */}
                        <div className="bg-white rounded-[20px] p-[20px] mb-[12px]">
                          <div className="flex items-center justify-between gap-3 mb-[16px]">
                            <div className="flex items-center gap-[12px]">
                              <div className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center bg-[#f1e9fd]">
                                <Package className="w-[20px] h-[20px] text-[#883fe2]" strokeWidth={1.6} />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-['Heebo:Light',sans-serif] font-light text-[12px] leading-[16px] text-[#676767]">מספר משלוח</span>
                                <span className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[18px] leading-[22px] text-[#0c1013] tabular-nums">
                                  {trackingStatus.shipmentNumber}
                                </span>
                              </div>
                            </div>
                            <div
                              className="h-[32px] flex items-center px-[12px] rounded-[60px] gap-[6px]"
                              style={{
                                background: trackingStatus.isDelivered ? '#22c55e'
                                  : trackingStatus.isReturned ? '#f59e0b'
                                  : trackingStatus.isCanceled ? '#ef4444'
                                  : '#883fe2',
                                color: '#ffffff',
                              }}
                            >
                              {trackingStatus.isDelivered ? <><CheckCircle className="w-[14px] h-[14px]" /> <span className="font-['Heebo:Regular',sans-serif] text-[14px]">נמסר</span></>
                              : trackingStatus.isReturned ? <span className="font-['Heebo:Regular',sans-serif] text-[14px]">הוחזר</span>
                              : trackingStatus.isCanceled ? <span className="font-['Heebo:Regular',sans-serif] text-[14px]">בוטל</span>
                              : <><Truck className="w-[14px] h-[14px]" /> <span className="font-['Heebo:Regular',sans-serif] text-[14px]">בדרך</span></>}
                            </div>
                          </div>

                          {(trackingStatus.lastUpdate?.date || trackingStatus.destinationBranch) && (
                            <div className="flex flex-wrap gap-[8px]">
                              {trackingStatus.lastUpdate?.date && (
                                <div className="flex items-center gap-[6px] h-[32px] px-[12px] rounded-[60px] bg-[#f4f5f7]">
                                  <Clock className="w-[14px] h-[14px] text-[#676767]" />
                                  <span className="font-['Heebo:Regular',sans-serif] text-[14px] text-[#0c1013] tabular-nums">
                                    {trackingStatus.lastUpdate.date} {trackingStatus.lastUpdate.time || ''}
                                  </span>
                                </div>
                              )}
                              {trackingStatus.destinationBranch && (
                                <div className="flex items-center gap-[6px] h-[32px] px-[12px] rounded-[60px] bg-[#f4f5f7]">
                                  <MapPin className="w-[14px] h-[14px] text-[#676767]" />
                                  <span className="font-['Heebo:Regular',sans-serif] text-[14px] text-[#0c1013]">
                                    {trackingStatus.destinationBranch}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timeline */}
                        {trackingStatus.history && trackingStatus.history.length > 0 && (
                          <div className="bg-white rounded-[20px] p-[20px] mb-[12px]">
                            <div className="font-['Heebo:Regular',sans-serif] text-[14px] text-[#676767] mb-[16px] text-right">
                              היסטוריית המסלול
                            </div>
                            <div className="relative">
                              <div className="absolute right-[7px] top-2 bottom-2 w-px bg-[#f1e9fd]" />
                              <div className="flex flex-col gap-[12px]">
                                {trackingStatus.history.map((h, i) => {
                                  const isLatest = i === trackingStatus.history.length - 1;
                                  return (
                                    <motion.div
                                      key={i}
                                      initial={{ opacity: 0, x: 10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.04 }}
                                      className="relative flex items-start gap-[12px] flex-row-reverse"
                                    >
                                      <div
                                        className={`w-[16px] h-[16px] rounded-full flex-shrink-0 mt-1 ${isLatest ? 'ring-4 ring-[#f1e9fd]' : ''}`}
                                        style={{ background: isLatest ? '#883fe2' : '#d4d4d4' }}
                                      />
                                      <div className="flex-1 min-w-0 text-right">
                                        <div className={`font-['Heebo:Regular',sans-serif] text-[14px] leading-[20px] ${isLatest ? 'text-[#0c1013] font-semibold' : 'text-[#0c1013]'}`}>
                                          {h.desc}
                                        </div>
                                        {(h.date || h.time) && (
                                          <div className="font-['Heebo:Light',sans-serif] font-light text-[12px] text-[#676767] mt-[2px] tabular-nums">
                                            {h.date} {h.time}
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Secondary CTA — file a complaint */}
                        <button
                          type="button"
                          onClick={() => {
                            setMode('support');
                            setStep('type');
                            setSelectedType('shipping');
                            setForm((f) => ({ ...f, order: trackingStatus.shipmentNumber || '' }));
                          }}
                          className="w-full h-[52px] flex items-center justify-center px-[20px] rounded-[60px] transition-opacity active:opacity-90"
                          style={{ background: '#ffffff', color: '#883fe2', border: '1px solid #f1e9fd' }}
                        >
                          <span className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[22.4px]">יש בעיה במשלוח? פתחי פנייה</span>
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          <AnimatePresence mode="wait">

            {/* ======== STEP 1: Select Product (Figma 346:4206) ======== */}
            {mode === 'support' && step === 'product' && (
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
                                <div className={`mt-2 mb-2 ${isMobile ? 'flex flex-col gap-2' : 'support-category-grid'}`}>
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
                  <div className={isMobile ? 'flex flex-col gap-2' : 'support-category-grid'}>
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
            {mode === 'support' && step === 'type' && (
              <motion.div
                key="support-type"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="mb-4 px-3 flex items-start justify-between">
                  <div>
                    <h2 className="support-title">מה הבעיה?</h2>
                    <p className="support-subtitle">בחרי את הבעיה שנתקלת בה</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('product')}
                    className="support-back-btn"
                    aria-label="חזרה"
                  >
                    <span className="support-back-icon" aria-hidden />
                  </button>
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
            {mode === 'support' && step === 'form' && (
              <motion.div
                key="support-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="mb-4 px-3 flex items-start justify-between">
                  <div>
                    <h2 className="support-title">פתיחת פנייה</h2>
                    <p className="support-subtitle">מלאו את הפרטים ונחזור אליכם בהקדם</p>
                  </div>
                  <button
                    type="button"
                    onClick={goBack}
                    className="support-back-btn"
                    aria-label="חזרה"
                  >
                    <span className="support-back-icon" aria-hidden />
                  </button>
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

                {/* Form fields — Figma 471:8076 pill inputs */}
                <div className="flex flex-col gap-[6px]">
                  <div className={isMobile ? 'flex flex-col gap-[6px]' : 'support-form-row'}>
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
                  </div>
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
            {mode === 'support' && step === 'success' && (
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
