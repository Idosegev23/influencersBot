import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'פאנל ניהול | InfluencerBot',
  description: 'ניהול המוצרים, הקופונים והסטטיסטיקות שלך',
};

export default function InfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

