'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeadMagnetPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string) => void;
  influencerName: string;
}

export function LeadMagnetPopup({ isOpen, onClose, onSubmit, influencerName }: LeadMagnetPopupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    await onSubmit(name.trim(), email.trim());
    setIsSubmitting(false);
  }, [name, email, onSubmit]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Glass overlay backdrop — per Stitch */}
          <motion.div
            className="absolute inset-0 backdrop-blur-[12px]"
            style={{ backgroundColor: 'rgba(248, 249, 251, 0.7)' }}
            onClick={onClose}
          />

          {/* Popup Card — max-w-[340px], rounded-xl per Stitch */}
          <motion.div
            className="relative w-full max-w-[340px] bg-white rounded-xl overflow-hidden"
            style={{
              boxShadow: '0 20px 40px rgba(12, 16, 19, 0.06)',
              outline: '1px solid rgba(204, 195, 216, 0.15)',
            }}
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            dir="rtl"
          >
            {/* Close button — top right per Stitch RTL */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-1 transition-colors"
              style={{ color: '#4a4455' }}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Card Content */}
            <div className="p-8 pt-12 flex flex-col items-center text-center">
              {/* Visual Anchor — 80px circle with star sub-badge per Stitch */}
              <div className="mb-6 relative">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#eaddff' }}
                >
                  <span
                    className="material-symbols-outlined text-4xl"
                    style={{ color: '#630ed4', fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                </div>
                <div className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <span
                    className="material-symbols-outlined text-xl"
                    style={{ color: '#ffba3e', fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                </div>
              </div>

              {/* Text Content */}
              <h1
                className="text-2xl font-extrabold leading-tight tracking-tight mb-3"
                style={{ color: '#191c1e' }}
              >
                רוצה גישה לקולקשיין הפרטי?
              </h1>
              <p
                className="text-base font-light leading-relaxed mb-8 px-2"
                style={{ color: '#4a4455' }}
              >
                תוכן בלעדי שלא תמצאו באינסטגרם
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="w-full space-y-4">
                <input
                  type="text"
                  placeholder="השם שלך"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border-none rounded-lg px-4 py-3 text-right outline-none transition-all focus:ring-2 focus:ring-purple-500/20"
                  style={{
                    backgroundColor: '#f3f4f6',
                    color: '#191c1e',
                  }}
                  required
                />
                <input
                  type="email"
                  placeholder="אימייל"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-none rounded-lg px-4 py-3 text-right outline-none transition-all focus:ring-2 focus:ring-purple-500/20"
                  style={{
                    backgroundColor: '#f3f4f6',
                    color: '#191c1e',
                  }}
                  required
                />

                {/* CTA — premium gradient per Stitch */}
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !email.trim()}
                  className="w-full text-white font-bold py-4 rounded-lg mt-4 text-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #630ed4 0%, #7c3aed 100%)',
                    boxShadow: '0 10px 30px -10px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  {isSubmitting ? 'שולח...' : 'קבלו גישה'}
                </button>
              </form>

              {/* Footer Note — per Stitch */}
              <p className="mt-6 text-[11px] font-light" style={{ color: '#7b7487' }}>
                אנחנו שונאים ספאם בדיוק כמוך. ניתן להסיר את עצמכם בכל עת.
              </p>
            </div>

            {/* Subtle decorative gradient bar at bottom per Stitch */}
            <div
              className="h-1.5 opacity-30"
              style={{ background: 'linear-gradient(135deg, #630ed4 0%, #7c3aed 100%)' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
