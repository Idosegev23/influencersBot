import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BestieAI — Your content, talking back',
  description:
    'BestieAI scans your Instagram, learns your voice, and answers every DM and website visitor — instantly, accurately, 24/7.',
  openGraph: {
    title: 'BestieAI — Your content, talking back',
    description:
      'Turn your Instagram content into a smart AI that answers followers, captures leads, and never sleeps.',
    type: 'website',
    locale: 'en_US',
  },
};

export default function BestieAILayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" lang="en" style={{ direction: 'ltr' }}>
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
