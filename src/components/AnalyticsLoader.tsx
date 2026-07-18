'use client';

import Script from 'next/script';
import { useConsent } from '@/lib/consent';
import type { AnalyticsSurface } from '@/lib/analytics/surface';

// Two GA4 properties, one per surface (Yoav keeps them separate):
//   - marketing site → the dedicated marketing tag
//   - /chat/[username] → the existing account-chat tag (NEXT_PUBLIC_GA4_ID)
// The marketing id is not a secret (it ships in the page anyway); hardcode a
// default so it works without a new Vercel env, but allow an env override.
const GA4_CHAT_ID = process.env.NEXT_PUBLIC_GA4_ID;
const GA4_MARKETING_ID = process.env.NEXT_PUBLIC_GA4_ID_MARKETING || 'G-DX1NJYE82Z';

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

/**
 * Mounts gtag.js (GA4), Meta Pixel and TikTok Pixel via next/script. The parent
 * (AnalyticsClient) only renders this on the marketing site and the account
 * chat — never on admin, dashboards, or [token] pages — and passes which of the
 * two it is. GA4 loads the surface's own property; loading exactly one tag per
 * page keeps the marketing and chat GA4 properties clean and unambiguous.
 *
 * Consent-gated: nothing loads until the visitor has actively chosen. GA4
 * follows the "analytics" category; the Meta and TikTok advertising pixels
 * follow "marketing". No choice yet (null) means no trackers.
 */
export function AnalyticsLoader({ surface }: { surface: AnalyticsSurface }) {
  const consent = useConsent();
  const allowAnalytics = consent?.analytics === true;
  const allowMarketing = consent?.marketing === true;

  const ga4Id = surface === 'marketing' ? GA4_MARKETING_ID : GA4_CHAT_ID;

  return (
    <>
      {ga4Id && allowAnalytics && (
        <>
          <Script
            id={`gtag-loader-${ga4Id}`}
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
          />
          <Script id={`gtag-init-${ga4Id}`} strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${ga4Id}');
            `}
          </Script>
        </>
      )}

      {META_PIXEL_ID && allowMarketing && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {TIKTOK_PIXEL_ID && allowMarketing && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${TIKTOK_PIXEL_ID}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
