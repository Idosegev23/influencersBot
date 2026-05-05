'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { Loader2, Send, CheckCircle2, AlertCircle, Package, Paperclip, X, FileText } from 'lucide-react';

interface PublicTicket {
  id: string;
  shortCode: string;
  customer_name: string;
  brand: string | null;
  order_number: string | null;
  original_message: string;
  status: string;
  created_at: string;
  tracking_number: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  awaiting_customer: 'ממתין לתשובתך',
  shipped: 'יצא למשלוח',
  resolved: 'טופל',
  closed: 'סגור',
  cancelled: 'בוטל',
};

interface AttachedFile {
  file: File;
  preview: string | null; // object URL for images
}

export default function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/reply/${encodeURIComponent(token)}`);
      if (!res.ok) {
        setError('הקישור לא תקין או פג תוקפו.');
        return;
      }
      const data = await res.json();
      setTicket(data.ticket);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAttach = (file: File) => {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('הקובץ גדול מ-10MB.');
      return;
    }
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImg && !isPdf) {
      setError('רק תמונות או PDF.');
      return;
    }
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment({
      file,
      preview: isImg ? URL.createObjectURL(file) : null,
    });
  };

  const handleRemoveAttachment = () => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  };

  const handleSend = async () => {
    if (!text.trim() && !attachment) return;
    setSending(true);
    setError(null);
    try {
      // Upload attachment first (if any) so we can reference its URL
      // in the reply payload.
      let attachmentUrl: string | null = null;
      let attachmentFilename: string | null = null;
      if (attachment) {
        const fd = new FormData();
        fd.append('file', attachment.file);
        const upRes = await fetch(`/api/support/reply/${encodeURIComponent(token)}/upload`, {
          method: 'POST',
          body: fd,
        });
        if (!upRes.ok) {
          const data = await upRes.json().catch(() => ({}));
          setError(data.error || 'העלאת הקובץ נכשלה');
          return;
        }
        const upData = await upRes.json();
        attachmentUrl = upData.url;
        attachmentFilename = upData.filename;
      }

      const res = await fetch(`/api/support/reply/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim() || (attachmentFilename ? `(נשלח קובץ: ${attachmentFilename})` : ''),
          attachmentUrl,
          attachmentFilename,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'שליחה נכשלה');
        return;
      }
      setSent(true);
      setText('');
      handleRemoveAttachment();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: '#f9fafb' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background: '#f9fafb' }}>
        <div className="max-w-md w-full bg-white rounded-2xl p-6 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <h1 className="text-lg font-semibold mb-1 text-gray-900">קישור לא תקין</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="min-h-screen p-4" dir="rtl" style={{ background: '#f9fafb' }}>
      <div className="max-w-xl mx-auto pt-6 pb-12">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">
              היי {ticket.customer_name?.split(/\s+/)[0] || 'לקוחה'} 👋
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              {STATUS_LABEL[ticket.status] || ticket.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            הפנייה שלך ל-<strong>{ticket.brand || 'המותג'}</strong> בהליך טיפול.
            <br />
            בדף הזה אפשר להוסיף עוד פרטים, לשאול שאלה, או להגיב לעדכון אחרון.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 rounded bg-gray-100">
              מספר פנייה: <code className="font-mono">#{ticket.shortCode}</code>
            </span>
            {ticket.order_number && (
              <span className="px-2 py-1 rounded bg-gray-100 inline-flex items-center gap-1">
                <Package className="w-3 h-3" />
                הזמנה: <code className="font-mono">{ticket.order_number}</code>
              </span>
            )}
          </div>
        </div>

        {/* Original message — context for the customer */}
        <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="text-xs text-gray-500 mb-1.5">הפנייה המקורית שלך</div>
          <pre className="whitespace-pre-wrap text-sm font-sans text-gray-800 leading-relaxed">
            {ticket.original_message}
          </pre>
        </div>

        {/* Reply form */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold text-gray-900 mb-1">הוספת תגובה</h2>
          <p className="text-xs text-gray-500 mb-3">
            ההודעה שתשלחי כאן תופיע אצל הצוות במערכת השירות, מתחת לפנייה שלך.
          </p>
          {sent ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-900">התגובה נשלחה ✨</p>
                <p className="text-xs text-green-700 mt-1">הצוות יראה את ההודעה שלך ויחזור אלייך בהקדם.</p>
                <button
                  onClick={() => setSent(false)}
                  className="text-xs text-green-700 underline mt-2"
                >
                  לכתוב הודעה נוספת
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="כתבי כאן..."
                rows={5}
                className="w-full text-sm p-3 rounded-xl border border-gray-200 outline-none focus:border-purple-500 resize-y"
                style={{ color: '#111827' }}
                disabled={sending}
              />

              {/* Attachment preview / picker */}
              {attachment ? (
                <div className="mt-3 p-3 rounded-xl border border-gray-200 flex items-center gap-3">
                  {attachment.preview ? (
                    <img
                      src={attachment.preview}
                      alt={attachment.file.name}
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {attachment.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(attachment.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={handleRemoveAttachment}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    type="button"
                    aria-label="הסר קובץ"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className="mt-3 inline-flex items-center gap-2 text-sm text-purple-700 hover:text-purple-900 cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                  <span>לצרף תמונה או PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttach(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}

              {error && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </p>
              )}
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleSend}
                  disabled={(!text.trim() && !attachment) || sending}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-opacity"
                  style={{ background: '#883fe2', color: '#fff' }}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  שליחת תגובה
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          פנייה מאובטחת — הקישור הזה אישי לפנייה שלך בלבד.
        </p>
      </div>
    </div>
  );
}
