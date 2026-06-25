/**
 * Agent self-service profile.
 *   GET  /api/agent/settings/profile  — current full_name/contact_email/whatsapp
 *   POST /api/agent/settings/profile  — update them (matching keys for ingestion)
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  return NextResponse.json({
    username: agent.username,
    full_name: agent.fullName,
    contact_email: agent.contactEmail,
    whatsapp: agent.whatsapp,
  });
}

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await req.json().catch(() => null);
  const contactEmail = String(body?.contact_email ?? '').trim();
  const whatsappRaw = String(body?.whatsapp ?? '').trim();
  const fullName = body?.full_name ? String(body.full_name).trim() : agent.fullName;

  if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
    return NextResponse.json({ error: 'אימייל לא תקין' }, { status: 400 });
  }
  if (!whatsappRaw) return NextResponse.json({ error: 'מספר וואטסאפ נדרש' }, { status: 400 });
  const waId = toWaId(whatsappRaw);
  if (!waId || waId.length < 9) return NextResponse.json({ error: 'מספר וואטסאפ לא תקין' }, { status: 400 });

  const { data: clash } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('contact_email', contactEmail)
    .neq('id', agent.id)
    .maybeSingle();
  if (clash) return NextResponse.json({ error: 'האימייל כבר משויך לסוכן אחר' }, { status: 409 });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ contact_email: contactEmail, whatsapp: waId, full_name: fullName, updated_at: new Date().toISOString() })
    .eq('id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
