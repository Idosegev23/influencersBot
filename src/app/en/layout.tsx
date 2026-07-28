import type { Metadata } from 'next';

// Value first, brand last: this is what shows in the tab, the search result and
// the social card. No em-dash here either, for the same reason as the body copy.
const TITLE = 'Your content talks back | BestieAI';
const DESCRIPTION =
  'BestieAI reads your Instagram, learns your voice, and answers every DM and ' +
  'every visitor on your site, instantly and accurately, 24/7.';

/**
 * The root layout declares `lang="he" dir="rtl"` on <html> and a canonical of
 * "/" for the whole app. Both are wrong for this route, so both are overridden:
 * direction on the wrapper below, canonical here.
 */
export const metadata: Metadata = {
  // `absolute` opts out of the root "%s | bestieAI" template — the title
  // already leads with the brand.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // Inherited from the root layout otherwise — it ships Hebrew keywords
  // ("צ׳אטבוט", "משפיענים", …), which is the wrong signal on an English page.
  keywords: ['AI chatbot', 'influencer marketing', 'Instagram DM automation', 'WhatsApp bot', 'website chat widget', 'creator tools', 'brand automation'],
  alternates: {
    canonical: '/en',
    languages: {
      'he-IL': '/',
      en: '/en',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    // Without this the root layout's og:url points shares of this page at the
    // Hebrew root.
    url: '/en',
    siteName: 'bestieAI',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function EnglishLandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="ltr"
      lang="en"
      /* globals.css sets font-family on `body`, so overriding the --font-* vars
         here would inherit right past it. The declaration has to sit on the
         element itself. Heebo's Latin set is a Hebrew face's afterthought and
         looks thin and uneven at the hero's display sizes. */
      style={{ direction: 'ltr', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      {children}
    </div>
  );
}
