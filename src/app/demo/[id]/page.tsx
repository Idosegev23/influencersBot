'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, ExternalLink } from 'lucide-react';

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

  const websiteUrl = `https://${config.domain}`;
  const primaryColor = config.theme.primaryColor || '#6366f1';

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
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
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            לאתר
          </a>
        </div>
      </div>

      {/* Main area — the customer's real site, served through the widget preview proxy.
          The proxy fetches the site server-side, strips X-Frame-Options / CSP (header AND
          <meta>), rebases relative asset URLs, and injects the real public/widget.js. That
          is why this page shows the genuine widget — cards, chips, modules, dark mode —
          rather than a reimplementation that drifts from it. */}
      <div className="flex-1 relative overflow-hidden">
        {config.domain ? (
          <iframe
            src={`/api/widget/preview/${accountId}`}
            className="w-full h-full border-0"
            title={`${config.brandName} — דמו ווידג׳ט`}
            /* Left open on purpose: widget.js needs same-origin storage and fetch. */
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        ) : (
          /* No website registered for this account — nothing to overlay the widget onto. */
          <div
            className="w-full h-full flex flex-col items-center justify-center relative"
            style={{ background: `linear-gradient(135deg, ${primaryColor}08 0%, ${primaryColor}15 50%, ${primaryColor}08 100%)` }}
          >
            <div className="absolute top-20 right-20 w-72 h-72 rounded-full opacity-[0.07]" style={{ backgroundColor: primaryColor }} />
            <div className="absolute bottom-32 left-16 w-48 h-48 rounded-full opacity-[0.05]" style={{ backgroundColor: primaryColor }} />

            {config.profilePic ? (
              <img src={config.profilePic} alt={config.brandName} className="w-20 h-20 rounded-2xl object-cover mb-6 shadow-lg" />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-6 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {config.brandName.charAt(0)}
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{config.brandName}</h1>
            <p className="text-gray-500 mb-6 max-w-md text-center">
              לא הוגדר אתר לחשבון הזה, ולכן אין על מה להציג את הווידג׳ט.
              הוסיפו דומיין בהגדרות הווידג׳ט כדי להפעיל את הדמו.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
