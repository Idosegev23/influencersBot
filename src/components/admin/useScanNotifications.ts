'use client';

import { createElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

// A single in-page toast entry.
interface Toast { id: number; title: string; body: string }

const TOAST_TTL_MS = 6000;

const wrapStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  insetInlineStart: 16,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxWidth: 320,
  pointerEvents: 'none',
};

const cardStyle: CSSProperties = {
  pointerEvents: 'auto',
  cursor: 'pointer',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderInlineStart: '4px solid #2663EB',
  borderRadius: 12,
  padding: '12px 14px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};

const titleStyle: CSSProperties = { fontWeight: 700, fontSize: 14, color: '#1f2937' };
const bodyStyle: CSSProperties = { fontSize: 13, color: '#6b7280', marginTop: 2 };

/**
 * Scan notifications: shows an in-page toast (auto-dismiss ~6s) and, when the
 * browser has granted permission, fires a native Notification too. Permission is
 * requested once on mount; unsupported / denied environments silently degrade.
 *
 * Usage:
 *   const { notify, Toasts } = useScanNotifications();
 *   // ...call notify('הסריקה הושלמה', accountName) on a terminal transition
 *   return <>{Toasts}{rest}</>;
 */
export function useScanNotifications(): { notify: (title: string, body: string) => void; Toasts: ReactElement } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const requestedRef = useRef(false);

  // Ask for Notification permission a single time on first mount.
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* unsupported — silently degrade */
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((title: string, body: string) => {
    // 1) In-page toast (auto-dismisses).
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, title, body }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_TTL_MS);

    // 2) Native browser notification when permitted.
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        // eslint-disable-next-line no-new
        new Notification(title, { body });
      }
    } catch {
      /* silently degrade */
    }
  }, []);

  const Toasts = createElement(
    'div',
    { dir: 'rtl', style: wrapStyle, 'aria-live': 'polite' },
    toasts.map((t) =>
      createElement(
        'div',
        { key: t.id, style: cardStyle, onClick: () => dismiss(t.id), role: 'status' },
        createElement('div', { style: titleStyle }, t.title),
        t.body ? createElement('div', { style: bodyStyle }, t.body) : null,
      ),
    ),
  );

  return { notify, Toasts };
}
