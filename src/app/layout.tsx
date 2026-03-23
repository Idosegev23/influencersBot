import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "bestieAI - AI Chatbot Platform",
  description: "Create personalized AI chatbots. Powered by OpenAI.",
  keywords: ["chatbot", "AI", "Instagram", "marketing"],
  manifest: "/manifest.json",
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
    siteName: "bestieAI",
    title: "bestieAI - AI Chatbot Platform",
    description: "Create personalized AI chatbots. Powered by OpenAI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "bestieAI",
    description: "Create personalized AI chatbots.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        {/* PWA Meta Tags */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
      </head>
      <body className="antialiased">
        {children}
        <CookieConsent />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
