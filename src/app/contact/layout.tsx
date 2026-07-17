import type { Metadata } from 'next';

// contact/page.tsx is a client component and cannot export metadata itself.
export const metadata: Metadata = {
  title: 'יצירת קשר',
  description:
    'רוצים לדבר איתנו? שאלות על המוצר, תמיכה טכנית או שיתוף פעולה עסקי — ' +
    'השאירו פנייה ונחזור אליכם.',
  alternates: { canonical: '/contact' },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
