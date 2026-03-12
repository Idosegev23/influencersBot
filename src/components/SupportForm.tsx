'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, CheckCircle, Phone, User, Package, MessageSquare, Tag, ChevronDown } from 'lucide-react';
import type { Product } from '@/types';

interface SupportFormProps {
  username: string;
  influencerName: string;
  products: Product[];
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SupportForm({ username, influencerName, products, onClose, onSuccess }: SupportFormProps) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [successBrand, setSuccessBrand] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    orderNumber: '',
    problem: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract unique brands from products
  const brands = Array.from(new Set(
    products
      .filter(p => p.brand || p.coupon_code)
      .map(p => p.brand || p.name.replace('קופון ', ''))
  )).filter(Boolean);

  const handleBrandClick = (brand: string) => {
    if (selectedBrand === brand) {
      setSelectedBrand(null);
    } else {
      setSelectedBrand(brand);
      setError(null);
      setFormData({ customerName: '', customerPhone: '', orderNumber: '', problem: '' });
      setSuccessBrand(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedBrand || !formData.customerName || !formData.customerPhone || !formData.problem) {
      setError('נא למלא את כל השדות החובה');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          brand: selectedBrand,
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          orderNumber: formData.orderNumber,
          problem: formData.problem,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'שגיאה בשליחת הפנייה');
      }

      setSuccessBrand(selectedBrand);
      setSelectedBrand(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת הפנייה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
        <Tag className="w-4 h-4" />
        <span className="text-sm">בחר את המותג שיש לך בעיה איתו</span>
      </div>

      {brands.length === 0 && (
        <div className="text-center py-6" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
          <p>אין מותגים זמינים</p>
        </div>
      )}

      {brands.map((brand) => (
        <div key={brand} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {/* Brand header */}
          <button
            onClick={() => handleBrandClick(brand)}
            className="w-full p-4 text-right transition-all flex items-center justify-between"
            style={{
              backgroundColor: selectedBrand === brand ? 'var(--color-primary)' : 'var(--color-background)',
              color: selectedBrand === brand ? 'white' : 'var(--color-text)',
            }}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${selectedBrand === brand ? 'rotate-180' : ''}`}
            />
            <span className="font-medium">{brand}</span>
          </button>

          {/* Inline success message */}
          <AnimatePresence>
            {successBrand === brand && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="p-4 text-center" style={{ backgroundColor: 'var(--color-background)' }}>
                  <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-primary)' }} />
                  <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>הפנייה נשלחה בהצלחה!</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text)', opacity: 0.6 }}>ניצור קשר בהקדם</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expandable form */}
          <AnimatePresence>
            {selectedBrand === brand && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-3" style={{ backgroundColor: 'var(--color-background)', borderTop: '1px solid var(--color-border)' }}>
                  {/* Customer Name */}
                  <div>
                    <label className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                      <User className="w-3.5 h-3.5" />
                      שם מלא *
                    </label>
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={{
                        backgroundColor: 'var(--color-surface, #fff)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      placeholder="הכנס את שמך המלא"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                      <Phone className="w-3.5 h-3.5" />
                      מספר טלפון *
                    </label>
                    <input
                      type="tel"
                      value={formData.customerPhone}
                      onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value.replace(/\D/g, '') })}
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={{
                        backgroundColor: 'var(--color-surface, #fff)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      placeholder="05XXXXXXXX"
                      dir="ltr"
                    />
                  </div>

                  {/* Order Number */}
                  <div>
                    <label className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                      <Package className="w-3.5 h-3.5" />
                      מספר הזמנה (אופציונלי)
                    </label>
                    <input
                      type="text"
                      value={formData.orderNumber}
                      onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={{
                        backgroundColor: 'var(--color-surface, #fff)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      placeholder="מספר ההזמנה מהאתר"
                    />
                  </div>

                  {/* Problem */}
                  <div>
                    <label className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                      <MessageSquare className="w-3.5 h-3.5" />
                      תיאור הבעיה *
                    </label>
                    <textarea
                      value={formData.problem}
                      onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl resize-none text-sm"
                      style={{
                        backgroundColor: 'var(--color-surface, #fff)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      placeholder="תאר את הבעיה שחווית..."
                    />
                  </div>

                  {error && (
                    <div className="p-2.5 rounded-lg bg-red-500/20 text-red-400 text-xs">
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 text-sm"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        שלח פנייה
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
