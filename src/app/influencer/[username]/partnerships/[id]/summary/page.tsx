import { Suspense } from 'react';
import ProjectSummaryClient from './ProjectSummaryClient';

export default function ProjectSummaryPage({ 
  params 
}: { 
  params: Promise<{ username: string; id: string }> 
}) {
  return (
    <Suspense fallback={<div className="p-8">טוען...</div>}>
      <ProjectSummaryClient params={params} />
    </Suspense>
  );
}
