/**
 * Agent onboarding step 2: required profile (email + WhatsApp).
 * These become the matching keys for inbound quote ingestion.
 * POST /api/agent/onboarding/profile { full_name?, contact_email, whatsapp }
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await request.json().catch(() => null);
  const contactEmail = String(body?.contact_email ?? '').trim();
  const whatsappRaw = String(body?.whatsapp ?? '').trim();
  const fullName = body?.full_name ? String(body.full_name).trim() : agent.fullName;

  if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
    return NextResponse.json({ error: 'נא להזין כתובת אימייל תקינה' }, { status: 400 });
  }
  if (!whatsappRaw) {
    return NextResponse.json({ error: 'מספר וואטסאפ נדרש' }, { status: 400 });
  }
  const waId = toWaId(whatsappRaw); // digits, no '+', normalized to match inbound msg.from
  if (!waId || waId.length < 9) {
    return NextResponse.json({ error: 'מספר וואטסאפ לא תקין' }, { status: 400 });
  }

  // contact_email must be unique across agents (it's an attribution key).
  const { data: clash } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('contact_email', contactEmail)
    .neq('id', agent.id)
    .maybeSingle();
  if (clash) {
    return NextResponse.json(
      { error: 'כתובת האימייל כבר משויכת לסוכן אחר' },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      contact_email: contactEmail,
      whatsapp: waId,
      full_name: fullName,
      onboarding_completed: true,
    })
    .eq('id', agent.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, redirect: '/agent' });
}
