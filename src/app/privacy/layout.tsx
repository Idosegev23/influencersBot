import type { Metadata } from 'next';

// privacy/page.tsx is a client component, so it cannot export metadata itself —
// without this the page inherited the root title and Google saw it as a
// duplicate of the landing page.
export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description:
    'מדיניות הפרטיות של bestieAI — איזה מידע נאסף, כיצד הוא מעובד, ספקי המשנה, ' +
    'תקופות שמירה, עוגיות, וכיצד לממש את זכויותיך לפי GDPR וחוק הגנת הפרטיות.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
