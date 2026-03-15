import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ניהול ווידג\'ט | Widget Management',
  description: 'ממשק ניהול ווידג\'ט לבעלי אתרים',
};

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 text-gray-900">
      {children}
    </div>
  );
}
