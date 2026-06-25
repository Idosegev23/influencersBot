/**
 * GET /api/agent/documents/[id]/file — stream a partnership document (agent-owned).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { downloadDoc } from '@/lib/crm/quotes';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('partnership_documents')
    .select('storage_path, mime_type, filename, partnership_id')
    .eq('id', id)
    .maybeSingle();
  if (!doc || !doc.storage_path) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: p } = await supabaseAdmin
    .from('partnerships')
    .select('agent_id')
    .eq('id', doc.partnership_id)
    .maybeSingle();
  if (!p || p.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const bytes = await downloadDoc(doc.storage_path);
  if (!bytes) return NextResponse.json({ error: 'unavailable' }, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': doc.mime_type || 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename || 'document')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
