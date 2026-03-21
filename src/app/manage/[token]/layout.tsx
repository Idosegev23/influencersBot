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
    <div dir="rtl" className="neon-admin min-h-screen bg-[#FFF7ED] text-[#373226]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
      {children}
    </div>
  );
}
