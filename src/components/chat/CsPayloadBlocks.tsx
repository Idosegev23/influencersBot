'use client';

// Structured CS screens for the main chat page (CS-engine spec §6). Rendered OUTSIDE
// DirectiveRenderer so the blocks persist in scrollback after the user replies.
import { useState } from 'react';
import type { CsUiPayload } from '@/lib/cs/payloads';

const STRINGS = {
  he: {
    orderTitle: 'סטטוס הזמנה',
    trackBtn: 'למעקב משלוח',
    detailsTitle: 'כדי לאתר את ההזמנה צריך עוד פרט או שניים:',
    phoneLabel: 'טלפון',
    orderLabel: 'מספר הזמנה',
    submit: 'שליחה',
    sent: 'הפרטים נשלחו ✓',
    ticketTitle: 'נפתחה פנייה ✓',
    ticketBody: 'מספר פנייה לשמירה:',
    escalatedTitle: 'הפנייה הועברה לנציג/ה',
    escalatedBody: 'נחזור אליך בהקדם 🙏',
  },
  en: {
    orderTitle: 'Order status',
    trackBtn: 'Track shipment',
    detailsTitle: 'To find your order I need one or two details:',
    phoneLabel: 'Phone',
    orderLabel: 'Order number',
    submit: 'Send',
    sent: 'Details sent ✓',
    ticketTitle: 'Ticket opened ✓',
    ticketBody: 'Your reference:',
    escalatedTitle: 'Passed to a human agent',
    escalatedBody: "We'll get back to you shortly 🙏",
  },
} as const;

function DetailsForm({ payload, t, dir, accent, onSubmit }: {
  payload: Extract<CsUiPayload, { kind: 'details_form' }>;
  t: typeof STRINGS.he | typeof STRINGS.en;
  dir: 'rtl' | 'ltr';
  accent: string;
  onSubmit: (d: { phone?: string; orderNumber?: string }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <div className="text-sm opacity-60" dir={dir}>{t.sent}</div>;
  }
  return (
    <div dir={dir} className="space-y-2">
      <div className="text-sm">{t.detailsTitle}</div>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t.phoneLabel}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white/70"
      />
      {payload.need === 'phone_and_order' && (
        <input
          type="text"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder={t.orderLabel}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white/70"
        />
      )}
      <button
        onClick={() => {
          if (!phone.trim() && !orderNumber.trim()) return;
          setSubmitted(true);
          onSubmit({ phone: phone.trim() || undefined, orderNumber: orderNumber.trim() || undefined });
        }}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
        style={{ background: accent }}
      >
        {t.submit}
      </button>
    </div>
  );
}

export default function CsPayloadBlocks({ payloads, language, brandColor, onDetailsSubmit }: {
  payloads: CsUiPayload[];
  language?: string;
  brandColor?: string;
  onDetailsSubmit: (d: { phone?: string; orderNumber?: string }) => void;
}) {
  const t = language === 'en' ? STRINGS.en : STRINGS.he;
  const dir: 'rtl' | 'ltr' = language === 'en' ? 'ltr' : 'rtl';
  const accent = brandColor || '#883fe2';

  return (
    <div className="mt-3 space-y-3">
      {payloads.map((p, i) => {
        if (p.kind === 'order_status_card') {
          const o = p.order;
          return (
            <div key={i} dir={dir} className="rounded-xl border border-gray-200 bg-white/80 p-4 max-w-md">
              <div className="text-sm font-bold mb-2">
                {t.orderTitle}{o.orderNumber ? ` #${o.orderNumber}` : ''}
              </div>
              {o.status && (
                <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold mb-2" style={{ background: `${accent}1a`, color: accent }}>
                  {o.status}
                </span>
              )}
              {o.itemSummary && <div className="text-sm mb-1">{o.itemSummary}</div>}
              {o.total && <div className="text-xs opacity-70 mb-1">{o.total}</div>}
              {o.shipmentText && <div className="text-sm mb-1">🚚 {o.shipmentText}</div>}
              {o.trackingUrl && (
                <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-1 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: accent }}>
                  {t.trackBtn}
                </a>
              )}
            </div>
          );
        }
        if (p.kind === 'details_form') {
          return (
            <div key={i} className="rounded-xl border border-gray-200 bg-white/80 p-4 max-w-md">
              <DetailsForm payload={p} t={t} dir={dir} accent={accent} onSubmit={onDetailsSubmit} />
            </div>
          );
        }
        if (p.kind === 'ticket_confirmation') {
          return (
            <div key={i} dir={dir} className="rounded-xl border border-gray-200 bg-white/80 p-4 max-w-md">
              <div className="text-sm font-bold mb-1">{t.ticketTitle}</div>
              <div className="text-xs opacity-70">
                {t.ticketBody} <span className="font-mono">{p.ticketId.slice(0, 8)}</span>
              </div>
            </div>
          );
        }
        if (p.kind === 'escalation_notice') {
          return (
            <div key={i} dir={dir} className="rounded-xl border border-gray-200 bg-white/80 p-4 max-w-md">
              <div className="text-sm font-bold mb-1">🛟 {t.escalatedTitle}</div>
              <div className="text-xs opacity-70">{t.escalatedBody}</div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
