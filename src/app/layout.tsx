import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { AnalyticsClient } from "@/components/AnalyticsClient";
import { Analytics } from "@vercel/analytics/next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bestie.ldrsgroup.com";

const TITLE = "bestieAI — צ׳אטבוט AI שמדבר בקול שלכם";
const DESCRIPTION =
  "פלטפורמת AI למשפיענים, מותגים וסוכנויות: צ׳אטבוט בקול שלכם, וידג׳ט לאתר, " +
  "מענה אוטומטי ב-DM וב-WhatsApp, ניתוח חוזים ובריפים, וניהול שת״פים — במקום אחד.";

export const metadata: Metadata = {
  // Required for Next to emit absolute og:url / og:image. Without it, OG URLs
  // fall back to the per-deployment VERCEL_URL preview host.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | bestieAI",
  },
  description: DESCRIPTION,
  keywords: ["צ׳אטבוט", "AI", "משפיענים", "אינסטגרם", "וואטסאפ", "וידג׳ט", "שיווק", "סוכנות"],
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/brand/bestie-icon.svg",
    apple: "/brand/bestie-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "bestieAI",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: "bestieAI",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    // Downgraded from summary_large_image: that card type promises a 1200x630
    // image, and the site does not ship one — X renders an empty card instead.
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale/userScalable: locking zoom fails WCAG 1.4.4 (Resize Text)
  // and blocks low-vision users from magnifying the Hebrew type.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0a1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* Default Google Fonts - will be overridden per influencer */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        {/* PWA Meta Tags — apple icon comes from the `icons` metadata above;
            the old /icons/icon-192x192.png link 404'd on every page load. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <AnalyticsClient />
        {children}
        <CookieConsent />
        <ServiceWorkerRegistration />
        <Analytics />
      </body>
    </html>
  );
}
