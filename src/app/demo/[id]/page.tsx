'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { DemoLockedScreen } from '@/components/demo/DemoLockedScreen';
import { DemoCountdownBar } from '@/components/demo/DemoCountdownBar';
import type { DemoAccess } from '@/lib/demo/access';

/**
 * Public Demo Page — the customer's own website with the real widget running on it.
 * URL: /demo/<accountId>
 * No auth required. Sharable link for clients.
 *
 * The page frames `/api/widget/preview/<accountId>`, which proxies the site and injects
 * `public/widget.js`. It deliberately does NOT reimplement the widget in React: an earlier
 * version did, and the copy silently lacked product cards, chips, modules, dark mode and
 * ratings. Whatever ships in widget.js is what a prospect sees here.
 */

interface WidgetConfig {
  theme: { primaryColor: string };
  brandName: string;
  profilePic: string | null;
  welcomeMessage: string;
  domain: string;
  // Present on every response since the demo-window feature; `state: 'open'`
  // with null dates for anything that isn't a timed demo.
  demo?: DemoAccess;
}

export default function DemoPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/widget/config?accountId=${accountId}`);
        const data = await res.json();
        if (data.error) { setLoading(false); return; }
        setConfig(data);
        // No frameability probe: the proxy strips X-Frame-Options and CSP itself, so a
        // site that blocks direct framing still renders here.
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  const handleCopyCode = () => {
    const snippet = `<!-- bestieAI Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  const handleCopyDemoLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-800 mb-2">הדמו לא נמצא</p>
          <p className="text-gray-500">הקישור אינו תקין או שהחשבון אינו פעיל</p>
        </div>
      </div>
    );
  }

  // Expired demo — the customer's site is no longer proxied (the preview route
  // 403s), so there is nothing to frame. Sell instead.
  if (config.demo?.state === 'locked') {
    return (
      <DemoLockedScreen
        accountId={accountId}
        brandName={config.brandName}
        logoUrl={config.profilePic}
      />
    );
  }

  // Empty when no site is registered. The preview route below still renders
  // something real in that case (it can recover a domain from the Instagram
  // bio, and falls back to the widget on a plain backdrop), so the frame is
  // always worth showing — only this outbound link needs the guard.
  const websiteUrl = config.domain ? `https://${config.domain}` : null;
  const primaryColor = config.theme.primaryColor || '#6366f1';

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir={(config as any).language === 'en' ? 'ltr' : 'rtl'}>
      {/* Renders null unless this is a timed demo. */}
      {config.demo && <DemoCountdownBar access={config.demo} surface="widget" language={(config as any).language === 'en' ? 'en' : 'he'} />}
      {/* Top banner */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm z-20">
        <div className="flex items-center gap-3">
          {config.profilePic ? (
            <img src={config.profilePic} alt={config.brandName} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {config.brandName.charAt(0)}
            </div>
          )}
          <div>
            <span className="text-sm font-semibold text-gray-800">{config.brandName}</span>
            <span className="text-xs text-gray-400 mr-2">— דמו ווידג׳ט</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyDemoLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            {codeCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {codeCopied ? 'הועתק!' : 'העתק לינק'}
          </button>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors"
            style={{ backgroundColor: primaryColor }}
          >
            <Copy className="w-3.5 h-3.5" />
            קוד הטמעה
          </button>
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              לאתר
            </a>
          )}
        </div>
      </div>

      {/* Main area — the customer's real site, served through the widget preview proxy.
          The proxy fetches the site server-side, strips X-Frame-Options / CSP (header AND
          <meta>), rebases relative asset URLs, and injects the real public/widget.js. That
          is why this page shows the genuine widget — cards, chips, modules, dark mode —
          rather than a reimplementation that drifts from it. */}
      <div className="flex-1 relative overflow-hidden">
        {/* Always framed. The preview route is the single authority on what a demo
            shows: the customer's real site when we have one, a domain recovered
            from their Instagram bio when the scan never registered one, and the
            live widget on a plain backdrop when there is genuinely no site. It
            never answers with JSON, so this frame is never empty. */}
        <iframe
          src={`/api/widget/preview/${accountId}`}
          className="w-full h-full border-0"
          title={`${config.brandName} — דמו ווידג׳ט`}
          /* allow-same-origin + allow-scripts: widget.js needs storage and fetch.
             allow-popups(-to-escape-sandbox): in-page links to OTHER sites are
             rewritten to target="_blank" so a click can't replace the demo, and
             they must open as a normal tab rather than a sandboxed one. */
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
