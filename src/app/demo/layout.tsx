import type { Metadata } from 'next';

// demo/page.tsx is a client component and cannot export metadata itself.
export const metadata: Metadata = {
  title: 'דמו חי',
  description:
    'התנסו בצ׳אטבוט של bestieAI — שאלו אותו על מוצרים, קופונים ותוכן, וראו איך ' +
    'הוא עונה בקול של היוצר.',
  alternates: { canonical: '/demo' },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
