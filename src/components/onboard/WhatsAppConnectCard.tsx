'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Embedded Signup v4 — Coexistence ("WhatsApp Business app onboarding").
 *
 * The customer keeps using the WhatsApp Business app on their phone; we answer on the same
 * number through the Cloud API. Two things about this flow differ from standard ES and are
 * easy to get wrong:
 *
 *  1. The success event is FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, and it carries ONLY a
 *     waba_id — no phone_number_id. The server resolves the number from the WABA.
 *  2. extras.featureType MUST be 'whatsapp_business_app_onboarding'. Without it the popup
 *     runs the standard flow, which migrates the number AWAY from the phone app — the exact
 *     opposite of what we promised the customer.
 *
 * v2 is deprecated 2026-10-15; this is v4 only.
 */

const SDK_ID = 'facebook-jssdk';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'connecting' }
  | { kind: 'connected'; paymentReady: boolean }
  | { kind: 'error'; message: string };

// Meta returns machine codes; the wizard is customer-facing and Hebrew.
function humanError(code?: string | number, step?: string): string {
  const c = String(code ?? '');
  if (c === '2' || c === 'API_UNAVAILABLE') return 'שירות של מטא לא זמין כרגע. נסו שוב בעוד כמה דקות.';
  if (/eligib|not_eligible/i.test(c)) {
    return 'המספר לא עומד בתנאי החיבור של מטא. ודאו שאפליקציית WhatsApp Business מעודכנת (2.24.17 ומעלה) ושהחשבון פעיל מעל 30 יום.';
  }
  if (step) return `התהליך נעצר בשלב "${step}". אפשר לנסות שוב.`;
  return 'החיבור לא הושלם. אפשר לנסות שוב.';
}

export function WhatsAppConnectCard({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const sessionRef = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  // Session logging listener — Meta REQUIRES it for this flow, and it is also the only place
  // a cancellation tells us which step the customer stopped on.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!/facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
          sessionRef.current = { phone_number_id: data.data?.phone_number_id, waba_id: data.data?.waba_id };
        } else if (data.event === 'CANCEL') {
          setStatus({ kind: 'error', message: humanError(data.data?.error_code, data.data?.current_step) });
        }
      } catch { /* not our message */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
    if (!appId) { setStatus({ kind: 'error', message: 'החיבור לוואטסאפ אינו מוגדר. פנו אלינו.' }); return; }

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v23.0' });
      setStatus({ kind: 'idle' });
    };
    if (!document.getElementById(SDK_ID)) {
      const js = document.createElement('script');
      js.id = SDK_ID;
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true; js.defer = true; js.crossOrigin = 'anonymous';
      document.body.appendChild(js);
    } else if ((window as any).FB) {
      setStatus({ kind: 'idle' });
    }
  }, []);

  const launch = useCallback(() => {
    const configId = process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID;
    const FB = (window as any).FB;
    if (!FB || !configId) { setStatus({ kind: 'error', message: 'החיבור לוואטסאפ אינו מוגדר. פנו אלינו.' }); return; }

    setStatus({ kind: 'connecting' });
    sessionRef.current = {};

    FB.login(
      async (response: any) => {
        const code = response?.authResponse?.code;
        if (!code) { setStatus({ kind: 'error', message: humanError() }); return; }

        try {
          const res = await fetch(`/api/onboard/${token}/whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              waba_id: sessionRef.current.waba_id,
              phone_number_id: sessionRef.current.phone_number_id,   // absent on Coexistence
            }),
          });
          const out = await res.json();
          if (!res.ok) {
            const map: Record<string, string> = {
              waba_not_owned: 'החשבון שנבחר אינו משויך אליכם. נסו שוב ובחרו את חשבון העסק שלכם.',
              phone_number_unresolved: 'לא הצלחנו לזהות את המספר בחשבון. פנו אלינו ונשלים ידנית.',
              exchange_failed: 'החיבור פג לפני שהספקנו לאשר אותו. נסו שוב.',
            };
            setStatus({ kind: 'error', message: map[out?.error] ?? humanError() });
            return;
          }
          setStatus({ kind: 'connected', paymentReady: Boolean(out.paymentReady) });
        } catch {
          setStatus({ kind: 'error', message: humanError() });
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          // Coexistence. Omitting this silently runs the standard flow, which takes the number
          // off the customer's phone app.
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
          setup: {},
        },
      },
    );
  }, [token]);

  return (
    <div className="rounded-2xl border border-gray-200 p-4 mb-4">
      <div className="text-sm font-semibold text-gray-900 mb-1">וואטסאפ</div>
      <p className="text-xs text-gray-400 mb-3">
        חברו את מספר הוואטסאפ העסקי שלכם. תמשיכו להשתמש באפליקציה בטלפון כרגיל — הבוט פשוט יענה על אותו מספר.
      </p>

      {status.kind === 'loading' && <p className="text-xs text-gray-400">טוען…</p>}

      {(status.kind === 'idle' || status.kind === 'error') && (
        <>
          <button
            onClick={launch}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ background: '#883fe2' }}
          >
            חבר וואטסאפ
          </button>
          {status.kind === 'error' && <p className="mt-2 text-xs text-amber-600">{status.message}</p>}
        </>
      )}

      {status.kind === 'connecting' && <p className="text-xs text-gray-500">ממתין לאישור בחלון של מטא…</p>}

      {status.kind === 'connected' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-green-600">✅ המספר חובר.</p>
          {!status.paymentReady && (
            // Not a failure: templates need Meta's approval before the billing probe can run.
            <p className="text-xs text-gray-500">
              ממתין לאישור תבנית אצל מטא — זה יכול לקחת עד 24 שעות. אחרי זה נוודא שאמצעי התשלום פעיל.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
