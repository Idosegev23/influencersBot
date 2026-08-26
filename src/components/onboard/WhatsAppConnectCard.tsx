'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardStrings } from '@/lib/i18n/dashboard';

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

/**
 * Accept any facebook.com subdomain. A fixed list is too brittle: the dialog actually runs on
 * m.facebook.com (display=touch), which an earlier www/web/business/staticxx allow-list dropped
 * — silently discarding the FINISH event, so waba_id never arrived and the connect could not
 * complete. Parsed with string ops rather than `new URL()`, which throws on opaque origins.
 */
function isFacebookOrigin(origin: unknown): boolean {
  if (typeof origin !== 'string' || !origin.startsWith('https://')) return false;
  const host = origin.slice('https://'.length).split('/')[0].split(':')[0].toLowerCase();
  return host === 'facebook.com' || host.endsWith('.facebook.com');
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'error'; message: string };

interface Billing {
  wabaId?: string;
  displayPhoneNumber?: string | null;
  paymentReady: boolean;
  templateApproved: boolean;
}

// Meta returns machine codes; the customer sees prose, in their own language.
function humanError(T: any, code?: string | number, step?: string): string {
  const c = String(code ?? '');
  if (c === '2' || c === 'API_UNAVAILABLE') return T.metaUnavailable;
  if (/eligib|not_eligible/i.test(c)) {
    return T.notEligible;
  }
  if (step) return T.stoppedAtStep.replace('{step}', step);
  return T.notCompleted;
}

/**
 * `apiBase` is the only thing that differs between the two places this card lives:
 *   onboarding wizard → /api/onboard/<token>
 *   customer dashboard → /api/influencer/<username>
 * Both expose the same /whatsapp and /whatsapp/billing endpoints, and both resolve the
 * account server-side — the card never handles an account id.
 */
export function WhatsAppConnectCard({
  apiBase,
  language,
}: {
  apiBase: string;
  /** Account language. Defaults to Hebrew so the onboarding wizard, which is
   *  Hebrew-facing today, renders exactly as before. */
  language?: 'he' | 'en';
}) {
  const T = getDashboardStrings(language === 'en' ? 'en' : 'he').whatsapp;
  const isEn = language === 'en';
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const sessionRef = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  // Session logging listener — Meta REQUIRES it for this flow, and it is also the only place
  // a cancellation tells us which step the customer stopped on.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Plain string comparison, never `new URL(...)`: the page receives postMessages from
      // extensions, Vercel Live and embedded frames, and an opaque origin ("null") makes the
      // URL constructor THROW. That throw was uncaught and killed this handler's invocation.
      if (!isFacebookOrigin(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
          sessionRef.current = { phone_number_id: data.data?.phone_number_id, waba_id: data.data?.waba_id };
          console.log('[wa-connect] captured signup result', data.event, sessionRef.current);
        } else if (data.event === 'CANCEL') {
          setStatus({ kind: 'error', message: humanError(T, data.data?.error_code, data.data?.current_step) });
        }
      } catch { /* not our message */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const appId = (process.env.NEXT_PUBLIC_FB_APP_ID || '').trim();
    if (!appId) { setStatus({ kind: 'error', message: T.notConfigured }); return; }

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v23.0' });
      setStatus({ kind: 'idle' });
    };
    if (!document.getElementById(SDK_ID)) {
      const js = document.createElement('script');
      js.id = SDK_ID;
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true; js.defer = true; js.crossOrigin = 'anonymous';
      js.onerror = () => {
        console.error('[wa-connect] Facebook SDK failed to load (check CSP script-src)');
        setStatus({ kind: 'error', message: T.sdkLoadFailed });
      };
      document.body.appendChild(js);
    } else if ((window as any).FB) {
      setStatus({ kind: 'idle' });
    }

    // A silently-blocked SDK is the worst failure mode: the button renders and does
    // nothing. If FB never initialises, say so instead of leaving a dead button.
    const t = setTimeout(() => {
      if (!(window as any).FB) {
        console.error('[wa-connect] FB SDK never initialised — likely CSP frame-src/script-src');
        setStatus({ kind: 'error', message: T.sdkNotLoaded });
      }
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const [billing, setBilling] = useState<Billing | null>(null);
  const [probing, setProbing] = useState(false);

  const refreshBilling = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/whatsapp/billing`);
      if (res.ok) setBilling(await res.json());
    } catch { /* the wizard simply keeps showing the previous state */ }
  }, [apiBase]);

  // The customer leaves to Meta's billing screen and comes back — re-check on focus so they
  // never have to guess whether we noticed.
  useEffect(() => {
    if (status.kind !== 'connected') return;
    void refreshBilling();
    const onFocus = () => void refreshBilling();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status.kind, refreshBilling]);

  const probe = useCallback(async () => {
    setProbing(true);
    try {
      await fetch(`${apiBase}/whatsapp/billing`, { method: 'POST' });
      await refreshBilling();
    } finally { setProbing(false); }
  }, [apiBase, refreshBilling]);

  const launch = useCallback(() => {
    const configId = (process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID || '').trim();
    const FB = (window as any).FB;
    if (!configId) {
      console.error('[wa-connect] NEXT_PUBLIC_WA_ES_CONFIG_ID is missing from the build');
      setStatus({ kind: 'error', message: T.notConfigured });
      return;
    }
    if (!FB) {
      console.error('[wa-connect] window.FB is undefined at launch — SDK blocked or not loaded');
      setStatus({ kind: 'error', message: T.popupUnavailable });
      return;
    }

    setStatus({ kind: 'connecting' });
    sessionRef.current = {};

    // If the popup never opens (blocked iframe, blocked popup), FB.login's callback never
    // fires and the card would sit on "waiting" forever. Time it out with a real message.
    const stuck = setTimeout(() => {
      setStatus((cur) => cur.kind === 'connecting'
        ? { kind: 'error', message: T.popupBlocked }
        : cur);
    }, 60_000);

    // The FB SDK type-checks this callback and REJECTS an async function outright
    // ("Expression is of type asyncfunction, not function"), so the popup opens but the
    // result never comes back. Keep it a plain function and hand off to an async helper.
    const onLoginResponse = (response: any) => { void handleLoginResponse(response); };

    const handleLoginResponse = async (response: any) => {
      clearTimeout(stuck);
      const code = response?.authResponse?.code;

      // Meta rejected a real code with "Invalid verification code format", which points at
      // WHAT we read out of the SDK response rather than at the exchange. Log the shape —
      // keys, length, prefix — never the code itself (single-use, 30s, still a credential).
      console.log('[wa-connect] login response shape', {
        status: response?.status,
        authKeys: response?.authResponse ? Object.keys(response.authResponse) : null,
        codeType: typeof code,
        codeLength: typeof code === 'string' ? code.length : null,
        codePrefix: typeof code === 'string' ? code.slice(0, 6) : null,
        topKeys: response ? Object.keys(response) : null,
      });
      if (!code) { setStatus({ kind: 'error', message: humanError(T, ) }); return; }
      if (!sessionRef.current.waba_id) {
        console.error('[wa-connect] no waba_id captured — the FINISH event never reached us');
        setStatus({ kind: 'error', message: T.resultMissing });
        return;
      }

      try {
        const res = await fetch(`${apiBase}/whatsapp`, {
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
            waba_not_owned: T.notYourAccount,
            phone_number_unresolved: T.numberNotFound,
            exchange_failed: T.expired,
          };
          setStatus({ kind: 'error', message: map[out?.error] ?? humanError(T, ) });
          return;
        }
        setStatus({ kind: 'connected' });
        void refreshBilling();
      } catch {
        setStatus({ kind: 'error', message: humanError(T, ) });
      }
    };

    FB.login(
      onLoginResponse,
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
  }, [apiBase]);

  return (
    <div className="rounded-2xl border border-gray-200 p-4 mb-4">
      <div className="text-sm font-semibold text-gray-900 mb-1">{T.title}</div>
      <p className="text-xs text-gray-400 mb-3">{T.intro}</p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
        <strong>{T.heads}</strong> {T.headsBody}
      </p>

      {status.kind === 'loading' && <p className="text-xs text-gray-400">{T.loading}</p>}

      {(status.kind === 'idle' || status.kind === 'error') && (
        <>
          <button
            onClick={launch}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ background: '#883fe2' }}
          >{T.connect}</button>
          {status.kind === 'error' && <p className="mt-2 text-xs text-amber-600">{status.message}</p>}
        </>
      )}

      {status.kind === 'connecting' && <p className="text-xs text-gray-500">{T.waitingMeta}</p>}

      {status.kind === 'connected' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-green-600">
            {T.numberConnected}{billing?.displayPhoneNumber ? ` — ${billing.displayPhoneNumber}` : ''}.
          </p>

          {billing?.paymentReady ? (
            <p className="text-sm font-medium text-green-600">{T.paymentActive}</p>
          ) : (
            <div className="rounded-xl bg-amber-50 border-2 border-amber-300 p-3 space-y-2">
              <div className="text-sm font-bold text-amber-900">{T.paymentMissing}</div>
              <p className="text-xs text-amber-800">
                <strong>{T.noCardNoMessages}</strong> {T.noCardBody}
              </p>
              <p className="text-xs text-amber-700">{T.metaBillsYou}</p>
              {billing?.wabaId && (
                <a
                  href={`https://business.facebook.com/settings/whatsapp-business-accounts/${billing.wabaId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-block px-4 py-2 rounded-xl text-sm font-bold text-white transition"
                  style={{ background: '#b45309' }}
                >{T.addPaymentNow}</a>
              )}
              <p className="text-xs text-gray-400">{T.onThePage}<span className="font-medium">Payment settings</span> → <span className="font-medium">Add payment method</span>.
              </p>

              {billing && !billing.templateApproved ? (
                // Not a failure — the probe needs an approved template before it can send anything.
                <p className="text-xs text-gray-500">{T.awaitingTemplate}</p>
              ) : (
                <button
                  onClick={probe}
                  disabled={probing}
                  className="text-xs font-semibold underline text-gray-700 disabled:opacity-40"
                >
                  {probing ? T.checking : T.addedCardRecheck}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
