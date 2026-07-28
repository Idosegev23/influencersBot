import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

/**
 * Hebrew landing page. The English twin lives at /en and renders the same
 * component with `lang="en"`.
 *
 * `languages` is the pair that stops Google treating the two as duplicate
 * content: it serves the Hebrew page to he-IL and the English one to everyone
 * else, instead of picking one and suppressing the other. `x-default` is the
 * fallback for locales matching neither.
 */
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: {
      'he-IL': '/',
      en: '/en',
      'x-default': '/',
    },
  },
};

export default function HomePage() {
  return <LandingPage lang="he" />;
}
