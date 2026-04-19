'use client';

import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/card';

const MonitoringTab = dynamic(() => import('@/components/admin/MonitoringTab'), { ssr: false });

export default function MonitoringPage() {
  return (
    <>
      <PageHeader
        eyebrow="מערכת"
        title="מוניטורינג"
        description="בריאות המערכת — בסיס נתונים, קאש, Redis, התראות ופעילות לפי ימים."
      />
      <Card className="p-4 md:p-6">
        <MonitoringTab />
      </Card>
    </>
  );
}
