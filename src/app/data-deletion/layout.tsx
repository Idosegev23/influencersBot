import type { Metadata } from 'next';

// data-deletion/page.tsx is a client component and cannot export metadata
// itself. This page is the data deletion URL required by the Meta Platform
// Terms, so it needs to be findable and correctly titled on its own.
export const metadata: Metadata = {
  title: 'בקשת מחיקת נתונים',
  description:
    'הגשת בקשה למחיקת המידע האישי שלכם מ-bestieAI. הבקשה מגיעה לצוות הפרטיות ' +
    'ומטופלת תוך 30 יום, בהתאם ל-GDPR ולתנאי הפלטפורמה של Meta.',
  alternates: { canonical: '/data-deletion' },
};

export default function DataDeletionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
