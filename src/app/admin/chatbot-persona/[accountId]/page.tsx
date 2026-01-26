import { Suspense } from 'react';
import PersonaEditorClient from './PersonaEditorClient';

export default function PersonaEditorPage({ 
  params 
}: { 
  params: Promise<{ accountId: string }> 
}) {
  return (
    <Suspense fallback={<div className="p-8">טוען...</div>}>
      <PersonaEditorClient params={params} />
    </Suspense>
  );
}
