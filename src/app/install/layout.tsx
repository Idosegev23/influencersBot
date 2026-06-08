import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'התקנת העוזר החכם באתר | BestieAI',
  description:
    'מדריך התקנה קצר — מחברים את העוזר החכם של BestieAI לאתר בעזרת שורת קוד אחת. הוראות לכל פלטפורמה: Shopify, WordPress, Wix, Squarespace ואתר מותאם אישית.',
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'BestieAI',
    title: 'התקנת העוזר החכם באתר',
    description: 'שורת קוד אחת. דקה אחת. בלי תוספים ובלי שינוי בקוד הקיים.',
  },
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return children;
}
