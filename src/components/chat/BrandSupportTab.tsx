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
  /** Deep-link prefill: pre-select a problem type (e.g. 'coupon') from a URL param. */
  initialProblemType?: string | null;
  /** Deep-link prefill: pre-select a coupon by its code (e.g. 'NOA') from a URL param. */
  initialCouponCode?: string | null;
  enableShipmentTracking?: boolean;
  initialMode?: 'support' | 'tracking';
  sessionId?: string | null;
  refSource?: string | null;
  /** Account language ('he'/'en'); drives all copy + direction. Default 'he'. */
  language?: string;
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
  { id: 'damaged', label: 'מוצר פגום', sublabel: 'הגיע שבור או ניזוק', labelEn: 'Damaged product', sublabelEn: 'Arrived broken or damaged', icon: 'problem-damaged' },
  { id: 'wrong_item', label: 'מוצר שגוי', sublabel: 'קיבלתי מוצר אחר', labelEn: 'Wrong item', sublabelEn: 'Received a different product', icon: 'problem-wrong' },
  { id: 'shipping', label: 'בעיית משלוח', sublabel: 'לא הגיע / איחר', labelEn: 'Shipping issue', sublabelEn: "Didn't arrive / delayed", icon: 'problem-shipping' },
  { id: 'coupon', label: 'בעיה בקופון', sublabel: 'קוד לא עובד', labelEn: 'Coupon problem', sublabelEn: "Code doesn't work", icon: 'problem-coupon' },
  { id: 'payment', label: 'בעיה בתשלום', sublabel: 'חיוב כפול / שגיאה', labelEn: 'Payment issue', sublabelEn: 'Double charge / error', icon: 'problem-payment' },
  { id: 'quality', label: 'איכות מוצר', sublabel: 'לא מתאים לציפיות', labelEn: 'Product quality', sublabelEn: "Didn't meet expectations", icon: 'problem-quality' },
  { id: 'other', label: 'אחר', sublabel: 'פנייה כללית', labelEn: 'Other', sublabelEn: 'General inquiry', icon: 'problem-other' },
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
  accountId, username, brandName, isMobile, coupons = [], initialDetails, initialProblemType, initialCouponCode, enableShipmentTracking, initialMode, sessionId, refSource, language,
}: BrandSupportTabProps) {
  const isEn = (language || 'he').toLowerCase() === 'en';
  const t = isEn ? {
    productIssueTab: 'Product issue', shipmentTab: 'Shipment status',
    orderStatus: 'Order status', enterOrderNum: 'Enter the order number from your purchase confirmation',
    orderNumPh: 'Order number', checkStatus: 'Check status', notFoundTitle: 'Not found',
    notFoundLead: "This order wasn't found in the shipping system yet",
    shipNumLabel: 'Tracking number', delivered: 'Delivered', returned: 'Returned', canceled: 'Canceled', inTransit: 'In transit',
    routeHistory: 'Route history', shipProblemCta: 'Shipping problem? Open a request',
    productIssueTitle: 'Product issue', whichProduct: 'Which product would you like to report?',
    searchProduct: 'Search product', generalInquiry: 'General inquiry', noSpecificProduct: 'No specific product',
    productsCount: (n: number) => `${n} products`, noProducts: 'No products found',
    whatProblem: 'What went wrong?', pickProblem: 'Choose the issue you ran into',
    back: 'Back', openRequest: 'Open a request', fillDetails: "Fill in the details and we'll get back to you soon",
    fullNamePh: 'Full name', phonePh: 'Phone number', orderOptPh: 'Order number (optional)', describePh: 'Describe the issue',
    submit: 'Submit request', successTitle: 'Your request was sent!',
    successBody: (b: string) => `The ${b} team will get back to you soon`, close: 'Close',
    errRequired: 'Please fill in all required fields', errSend: 'Error sending the request',
    errEnterOrder: 'Please enter an order number', errDigits: 'The number must contain digits only', errConn: 'A connection error occurred with the shipping service',
    ctxProduct: 'Product', ctxLink: 'Link', ctxProblemType: 'Issue type', ctxCoupon: 'Coupon', ctxDetails: 'Details', ctxOther: 'Other',
  } : {
    productIssueTab: 'בעיה במוצר', shipmentTab: 'סטטוס משלוח',
    orderStatus: 'סטטוס הזמנה', enterOrderNum: 'הזיני את מספר ההזמנה מאישור הרכישה',
    orderNumPh: 'מספר הזמנה', checkStatus: 'בדיקת סטטוס', notFoundTitle: 'לא נמצא',
    notFoundLead: 'ההזמנה הזו עדיין לא נמצאה במערכת השילוח',
    shipNumLabel: 'מספר משלוח', delivered: 'נמסר', returned: 'הוחזר', canceled: 'בוטל', inTransit: 'בדרך',
    routeHistory: 'היסטוריית המסלול', shipProblemCta: 'יש בעיה במשלוח? פתחי פנייה',
    productIssueTitle: 'בעיה במוצר', whichProduct: 'על איזה מוצר תרצו לדווח?',
    searchProduct: 'חיפוש מוצר', generalInquiry: 'פנייה כללית', noSpecificProduct: 'ללא מוצר ספציפי',
    productsCount: (n: number) => `${n} מוצרים`, noProducts: 'לא נמצאו מוצרים',
    whatProblem: 'מה הבעיה?', pickProblem: 'בחרי את הבעיה שנתקלת בה',
    back: 'חזרה', openRequest: 'פתיחת פנייה', fillDetails: 'מלאו את הפרטים ונחזור אליכם בהקדם',
    fullNamePh: 'שם מלא', phonePh: 'מספר טלפון', orderOptPh: 'מספר הזמנה (אופציונלי)', describePh: 'תיאור הבעיה',
    submit: 'שלח פנייה', successTitle: 'הפנייה נשלחה בהצלחה!',
    successBody: (b: string) => `צוות ${b} יחזור אליכם בהקדם`, close: 'סגור',
    errRequired: 'נא למלא את כל השדות החובה', errSend: 'שגיאה בשליחת הפנייה',
    errEnterOrder: 'נא להזין מספר הזמנה', errDigits: 'המספר צריך להכיל ספרות בלבד', errConn: 'אירעה שגיאה בחיבור לשירות המשלוחים',
    ctxProduct: 'מוצר', ctxLink: 'קישור', ctxProblemType: 'סוג בעיה', ctxCoupon: 'קופון', ctxDetails: 'פירוט', ctxOther: 'אחר',
  };
  // Deep-link prefill: if the URL named a valid problem type (e.g. ?problem=coupon)
  // we skip the product + type pickers and drop the visitor straight on the form
  // with the type locked in. Validated against PROBLEM_TYPES so a junk param falls
  // back to the normal flow.
  const deepLinkType = useMemo<ProblemTypeId | null>(() => {
    const v = (initialProblemType || '').toLowerCase().trim();
    return PROBLEM_TYPES.some(t => t.id === v) ? (v as ProblemTypeId) : null;
  }, [initialProblemType]);

  // mode: 'support' = problem report flow (default), 'tracking' = order status lookup
  const [mode, setMode] = useState<'support' | 'tracking'>(initialMode || 'support');

  // External requests to switch mode (e.g. user clicked the persistent
  // CTA "סטטוס משלוחים" while already on the support tab) — re-sync.
  useEffect(() => {
    if (initialMode && initialMode !== mode) setMode(initialMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);
  const [step, setStep] = useState<'product' | 'type' | 'form' | 'success'>(deepLinkType ? 'form' : 'product');

  // Tracking sub-flow. The customer enters ONE number — we try it as
  // an order_number first (most common case — they have it from the
  // purchase confirmation), and silently fall back to shipment_number
  // if Focus doesn't recognise it. No toggle exposed to the customer.
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<ShipmentStatus | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const lookupShipment = useCallback(async () => {
    const raw = trackingNumber.trim();
    if (!raw) {
      setTrackingError(t.errEnterOrder);
      return;
    }

    const cleaned = raw.replace(/^#+/, '').replace(/\s+/g, '');
    if (!/^\d+$/.test(cleaned)) {
      setTrackingError(t.errDigits);
      return;
    }

    setTrackingLoading(true);
    setTrackingError(null);
    try {
      // Primary: order-number lookup (P2, scoped to brand master).
      const orderRes = await fetch(
        `/api/shipment/status?username=${encodeURIComponent(username)}&reference=${encodeURIComponent(cleaned)}`,
      );
      const orderData = await orderRes.json();
      if (orderRes.ok && orderData?.found) {
        setTrackingStatus(orderData as ShipmentStatus);
        return;
      }

      // Fallback: shipment-number lookup (P1). Same number, different
      // semantic — covers the case where the customer pasted the Focus
      // number from the email instead of their order number.
      const shipRes = await fetch(
        `/api/shipment/status?username=${encodeURIComponent(username)}&shipmentNumber=${encodeURIComponent(cleaned)}`,
      );
      const shipData = await shipRes.json();
      if (shipRes.ok && shipData?.found) {
        setTrackingStatus(shipData as ShipmentStatus);
        return;
      }

      // Neither matched — surface a not-found view so the explainer
      // panel renders with the "maybe order# / maybe shipment#" hints.
      setTrackingStatus(orderData as ShipmentStatus);
    } catch {
      setTrackingError(t.errConn);
    } finally {
      setTrackingLoading(false);
    }
  }, [trackingNumber, username]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Selected state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedType, setSelectedType] = useState<ProblemTypeId | null>(deepLinkType);
  // Deep-link prefill: pre-select the coupon named in the URL (?coupon=NOA). Prefer
  // the real coupon row (carries description/discount); if the brand doesn't expose
  // that code in its list, synthesize a minimal one from the URL so the form still
  // shows "🎟️ NOA" and the submitted ticket is tagged with the code. Computed once
  // at mount — by the time the support tab renders the brand coupons are loaded.
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(() => {
    const code = (initialCouponCode || '').trim();
    if (!code) return null;
    const match = coupons.find(c => (c.coupon_code || '').toLowerCase() === code.toLowerCase());
    return match || { brand_name: brandName, coupon_code: code.toUpperCase(), description: null, category: null };
  });

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
      setError(t.errRequired);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Build detailed problem message with context
      const parts: string[] = [];
      if (selectedProduct) {
        parts.push(`${t.ctxProduct}: ${selectedProduct.name_he || selectedProduct.name}`);
        if (selectedProduct.product_url) parts.push(`${t.ctxLink}: ${selectedProduct.product_url}`);
      }
      const pt = PROBLEM_TYPES.find(p => p.id === selectedType);
      const typeLabel = (isEn ? pt?.labelEn : pt?.label) || t.ctxOther;
      parts.push(`${t.ctxProblemType}: ${typeLabel}`);
      if (selectedCoupon) {
        parts.push(`${t.ctxCoupon}: ${selectedCoupon.coupon_code} (${selectedCoupon.brand_name})`);
      }
      parts.push(`${t.ctxDetails}: ${form.details}`);

      // Defensive fallback — if the prop is null but localStorage has
      // a ref for this username, use it. Production data showed 873/1014
      // visits had a ref but only 15/387 tickets — most of the gap was
      // either timing (prop captured before useEffect populated it) or
      // a re-render path that lost the ref. Reading directly at submit
      // is the simplest belt-and-suspenders.
      let effectiveRef = refSource || null;
      if (!effectiveRef && typeof window !== 'undefined') {
        try {
          effectiveRef = window.localStorage.getItem(`chat_ref_${username}`) || null;
        } catch {
          /* ignore — private mode etc. */
        }
      }

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
          sessionId: sessionId || null,
          refSource: effectiveRef,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.errSend);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errSend);
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
                <span className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px]">{t.productIssueTitle}</span>
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
                <span className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px]">{t.shipmentTab}</span>
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
              {/* Header — single input. Customer types order# (default);
                  if Focus doesn't recognise it we silently retry as a
                  Focus shipment# before showing "not found". */}
              <div className="mb-4 px-3 flex flex-col items-end gap-[2px]">
                <h2 className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[24px] leading-[28px] text-[#0c1013] text-right">
                  {t.orderStatus}
                </h2>
                <p className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[24px] text-[#676767] text-right">
                  {t.enterOrderNum}
                </p>
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
                    placeholder={t.orderNumPh}
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
                    <span className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[22.4px]">{t.checkStatus}</span>
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
                      <div className="bg-white rounded-[20px] p-6 text-right">
                        <div className="w-[56px] h-[56px] mx-auto rounded-[14px] flex items-center justify-center mb-4 bg-[#f1e9fd]">
                          <Search className="w-7 h-7 text-[#883fe2]" />
                        </div>
                        <h3 className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[20px] leading-[24px] text-[#0c1013] mb-2 text-center">{t.notFoundTitle}</h3>
                        <p className="font-['Heebo:Regular',sans-serif] text-[14px] leading-[21px] text-[#676767] mb-4 text-center">{trackingStatus.statusText}</p>

                        {/* The lookup tries both order# and shipment# — if
                            we got here, neither matched. Most likely cause:
                            the order hasn't shipped yet. */}
                        <div className="bg-[#fef9e7] border border-[#fde68a] rounded-[12px] p-4">
                          <div className="flex gap-2 items-start mb-2">
                            <AlertCircle className="w-[18px] h-[18px] text-[#b45309] flex-shrink-0 mt-[2px]" />
                            <p className="font-['Heebo:SemiBold',sans-serif] font-semibold text-[14px] leading-[20px] text-[#92400e]">
                              {t.notFoundLead}
                            </p>
                          </div>
                          <ul className="font-['Heebo:Regular',sans-serif] text-[13px] leading-[20px] text-[#7c2d12] pr-6 list-disc text-right space-y-1">
                            <li>ייתכן שההזמנה עוד לא יצאה מהמחסן — מקבלים מייל מ-Focus כשהיא יוצאת.</li>
                            <li>בדקי שהמספר נכון מאישור הרכישה (או מהמייל של Focus, אם כבר קיבלת).</li>
                            <li>אם עברו מעל 5 ימי עסקים, אפשר לפתוח פנייה דרך טאב "תמיכה" ונבדוק.</li>
                          </ul>
                        </div>
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
                                <span className="font-['Heebo:Light',sans-serif] font-light text-[12px] leading-[16px] text-[#676767]">{t.shipNumLabel}</span>
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
                              {trackingStatus.isDelivered ? <><CheckCircle className="w-[14px] h-[14px]" /> <span className="font-['Heebo:Regular',sans-serif] text-[14px]">{t.delivered}</span></>
                              : trackingStatus.isReturned ? <span className="font-['Heebo:Regular',sans-serif] text-[14px]">{t.returned}</span>
                              : trackingStatus.isCanceled ? <span className="font-['Heebo:Regular',sans-serif] text-[14px]">{t.canceled}</span>
                              : <><Truck className="w-[14px] h-[14px]" /> <span className="font-['Heebo:Regular',sans-serif] text-[14px]">{t.inTransit}</span></>}
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
                              {t.routeHistory}
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
                          <span className="font-['Heebo:Regular',sans-serif] text-[18px] leading-[22.4px]">{t.shipProblemCta}</span>
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
                  <h2 className="support-title">{t.productIssueTitle}</h2>
                  <p className="support-subtitle">{t.whichProduct}</p>
                </div>

                {/* Search pill */}
                {products.length > 6 && (
                  <div className="support-search mb-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={t.searchProduct}
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
                    <p className="support-card-title">{t.generalInquiry}</p>
                    <p className="support-card-subtitle">{t.noSpecificProduct}</p>
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
                              <p className="support-card-subtitle">{t.productsCount(items.length)}</p>
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
                  <p className="text-center text-sm mt-6" style={{ color: '#999' }}>{t.noProducts}</p>
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
                    <h2 className="support-title">{t.whatProblem}</h2>
                    <p className="support-subtitle">{t.pickProblem}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('product')}
                    className="support-back-btn"
                    aria-label={t.back}
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
                          <p>{isEn ? type.labelEn : type.label}</p>
                          <p>{isEn ? type.sublabelEn : type.sublabel}</p>
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
                    <h2 className="support-title">{t.openRequest}</h2>
                    <p className="support-subtitle">{t.fillDetails}</p>
                  </div>
                  <button
                    type="button"
                    onClick={goBack}
                    className="support-back-btn"
                    aria-label={t.back}
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
                      <p>{(() => { const p = PROBLEM_TYPES.find(p => p.id === selectedType); return isEn ? p?.labelEn : p?.label; })()}</p>
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
                      placeholder={t.fullNamePh}
                      className="support-form-input"
                    />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                      placeholder={t.phonePh}
                      className="support-form-input"
                    />
                    <input
                      type="text"
                      value={form.order}
                      onChange={e => setForm({ ...form, order: e.target.value })}
                      placeholder={t.orderOptPh}
                      className="support-form-input"
                    />
                  </div>
                  <textarea
                    value={form.details}
                    onChange={e => setForm({ ...form, details: e.target.value })}
                    placeholder={t.describePh}
                    className="support-form-textarea"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !form.name || !form.phone || !form.details}
                  className={`support-cta mt-8 ${submitting || !form.name || !form.phone || !form.details ? 'support-cta--disabled' : 'support-cta--enabled'}`}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t.submit}
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
                  {t.successTitle}
                </h3>
                <p className="text-[15px] mb-8" style={{ color: '#888' }}>
                  {t.successBody(brandName)}
                </p>
                <button onClick={reset} className="problem-btn-submit px-10">
                  {t.close}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
