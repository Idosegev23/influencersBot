'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, CheckCircle, Phone, User, Package, MessageSquare, Tag } from 'lucide-react';
import type { Product } from '@/types';

interface SupportFormProps {
  username: string;
  influencerName: string;
  products: Product[];
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SupportForm({ username, influencerName, products, onClose, onSuccess }: SupportFormProps) {
  const [step, setStep] = useState<'brand' | 'details' | 'success'>('brand');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
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
      .map(p => p.brand || (p.name ? p.name.replace('קופון ', '') : ''))
  )).filter(Boolean);

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

      setStep('success');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת הפנייה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
            פניית תמיכה
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all hover:bg-black/10"
            style={{ color: 'var(--color-text)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <AnimatePresence mode="wait">
            {step === 'brand' && (
              <motion.div
                key="brand"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  <Tag className="w-4 h-4" />
                  <span className="text-sm">בחר את המותג שיש לך בעיה איתו</span>
                </div>

                <div className="grid gap-2">
                  {brands.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => {
                        setSelectedBrand(brand);
                        setStep('details');
                      }}
                      className="w-full p-4 rounded-xl text-right transition-all hover:scale-[1.02]"
                      style={{ 
                        backgroundColor: 'var(--color-background)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    >
                      <div className="font-medium">{brand}</div>
                    </button>
                  ))}
                </div>

                {brands.length === 0 && (
                  <div className="text-center py-6" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                    <p>אין מותגים זמינים</p>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div 
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                >
                  מותג: {selectedBrand}
                </div>

                {/* Customer Name */}
                <div>
                  <label className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                    <User className="w-4 h-4" />
                    שם מלא *
                  </label>
                  <input
                    type="text"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl"
                    style={{ 
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                    placeholder="הכנס את שמך המלא"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                    <Phone className="w-4 h-4" />
                    מספר טלפון *
                  </label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-4 py-3 rounded-xl"
                    style={{ 
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                    placeholder="05XXXXXXXX"
                    dir="ltr"
                  />
                </div>

                {/* Order Number */}
                <div>
                  <label className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                    <Package className="w-4 h-4" />
                    מספר הזמנה (אופציונלי)
                  </label>
                  <input
                    type="text"
                    value={formData.orderNumber}
                    onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl"
                    style={{ 
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                    placeholder="מספר ההזמנה מהאתר"
                  />
                </div>

                {/* Problem */}
                <div>
                  <label className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                    <MessageSquare className="w-4 h-4" />
                    תיאור הבעיה *
                  </label>
                  <textarea
                    value={formData.problem}
                    onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl resize-none"
                    style={{ 
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                    placeholder="תאר את הבעיה שחווית..."
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep('brand')}
                    className="flex-1 py-3 rounded-xl transition-all"
                    style={{ 
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    חזרה
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        שלח פנייה
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6"
              >
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                  הפנייה נשלחה בהצלחה!
                </h3>
                <p className="mb-6" style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  {influencerName} יחזור אליך בהקדם האפשרי
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-xl text-white font-medium transition-all hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  סגור
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

