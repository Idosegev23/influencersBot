import type { Metadata } from 'next';

// The page body is Hebrew (~3,200 Hebrew characters), so the document must say
// so: lang="en" / dir="ltr" / locale en_US mis-ordered the Hebrew nav and CTAs
// and told Google this was an English page.
export const metadata: Metadata = {
  // `absolute` opts out of the root "%s | bestieAI" template — the title
  // already leads with the brand.
  title: { absolute: 'BestieAI — התוכן שלך, עונה בשבילך' },
  description:
    'BestieAI סורק את האינסטגרם שלך, לומד את הקול שלך, ועונה לכל DM ולכל מבקר באתר — מיידית, מדויק, 24/7.',
  alternates: { canonical: '/bestieai' },
  openGraph: {
    title: 'BestieAI — התוכן שלך, עונה בשבילך',
    description:
      'הופכים את התוכן שלך ל-AI חכם שעונה לעוקבים, קולט לידים, ולא הולך לישון.',
    type: 'website',
    locale: 'he_IL',
  },
};

export default function BestieAILayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="he" style={{ direction: 'rtl' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </div>
  );
}
