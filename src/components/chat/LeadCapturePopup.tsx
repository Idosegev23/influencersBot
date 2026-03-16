'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle } from 'lucide-react';

interface LeadCapturePopupProps {
  username: string;
  sessionId: string | null;
  onClose: () => void;
  onSubmit: (data: { firstName: string; lastName: string; serialNumber: string; leadId: string }) => void;
}

export function LeadCapturePopup({ username, sessionId, onClose, onSubmit }: LeadCapturePopupProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ serialNumber: string; firstName: string } | null>(null);

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError('יש למלא את כל השדות');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, username, sessionId }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'שגיאה בשמירה');
        setLoading(false);
        return;
      }

      setSuccess({ serialNumber: data.serialNumber, firstName: data.firstName });

      // Auto-close after showing success
      setTimeout(() => {
        onSubmit({
          firstName: data.firstName,
          lastName,
          serialNumber: data.serialNumber,
          leadId: data.leadId,
        });
      }, 2500);
    } catch {
      setError('שגיאה בחיבור');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[340px] rounded-[30px] p-7 relative"
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
          >
            <X className="w-4 h-4" style={{ color: '#676767' }} />
          </button>

          {success ? (
            /* Success state */
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <CheckCircle className="w-14 h-14 mx-auto mb-4" style={{ color: '#34c759' }} />
              </motion.div>
              <h3 className="text-[20px] font-bold mb-2" style={{ color: '#0c1013' }}>
                {success.firstName}, נרשמת בהצלחה!
              </h3>
              <p className="text-[14px] mb-3" style={{ color: '#676767' }}>
                המספר הסידורי שלך:
              </p>
              <div
                className="inline-block px-5 py-2.5 rounded-full text-[18px] font-bold"
                style={{ backgroundColor: '#f4f5f7', color: '#0c1013' }}
              >
                {success.serialNumber}
              </div>
              <p className="text-[12px] mt-3" style={{ color: '#999' }}>
                שמרו את המספר — הוא מזהה אתכם בכניסות הבאות
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="text-center mb-6">
                <h3 className="text-[20px] font-bold mb-1" style={{ color: '#0c1013' }}>
                  רוצה תכנים מומלצים?
                </h3>
                <p className="text-[14px]" style={{ color: '#676767' }}>
                  השאירו פרטים ונתאים לכם תוכן אישי
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="שם פרטי"
                  dir="rtl"
                  className="w-full h-[50px] px-5 rounded-full text-[15px] outline-none transition-all focus:ring-2 focus:ring-black/10"
                  style={{ backgroundColor: '#f4f5f7', color: '#0c1013', border: '1px solid #e5e5ea' }}
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="שם משפחה"
                  dir="rtl"
                  className="w-full h-[50px] px-5 rounded-full text-[15px] outline-none transition-all focus:ring-2 focus:ring-black/10"
                  style={{ backgroundColor: '#f4f5f7', color: '#0c1013', border: '1px solid #e5e5ea' }}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="נייד"
                  dir="ltr"
                  className="w-full h-[50px] px-5 rounded-full text-[15px] outline-none transition-all focus:ring-2 focus:ring-black/10 text-right"
                  style={{ backgroundColor: '#f4f5f7', color: '#0c1013', border: '1px solid #e5e5ea' }}
                />
              </div>

              {error && (
                <p className="text-[13px] text-center mt-2" style={{ color: '#ff3b30' }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-[50px] rounded-full text-[16px] font-semibold mt-5 transition-all flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#0c1013', color: '#ffffff' }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'קבלו תוכן מותאם אישית'
                )}
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
