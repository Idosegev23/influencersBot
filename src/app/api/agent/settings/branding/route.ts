/**
 * Agent/agency branding for the quote PDF.
 *   GET  → the agent's agency details (+ whether a logo is set)
 *   POST → multipart: name/phone/email/address (+ optional logo image) → saved on
 *          public.users.agency; the logo goes to the private partnership-documents bucket.
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
const BUCKET = 'partnership-documents';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { data } = await supabaseAdmin.from('users').select('agency').eq('id', gate.agent.id).maybeSingle();
  const a = (data?.agency as any) || {};
  return NextResponse.json({
    agency: {
      name: a.name || '',
      phone: a.phone || '',
      email: a.email || '',
      address: a.address || '',
      has_logo: !!a.logo_path,
    },
  });
}

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 });
  }

  const { data: cur } = await supabaseAdmin.from('users').select('agency').eq('id', agent.id).maybeSingle();
  const agency: any = { ...((cur?.agency as any) || {}) };
  agency.name = String(form.get('name') || '').trim() || null;
  agency.phone = String(form.get('phone') || '').trim() || null;
  agency.email = String(form.get('email') || '').trim() || null;
  agency.address = String(form.get('address') || '').trim() || null;

  const logo = form.get('logo');
  if (logo instanceof File && logo.size > 0) {
    if (!/image\//.test(logo.type)) return NextResponse.json({ error: 'הלוגו חייב להיות תמונה' }, { status: 400 });
    if (logo.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'לוגו גדול מדי (מקס 4MB)' }, { status: 400 });
    const ext = logo.type === 'image/png' ? 'png' : /jpe?g/.test(logo.type) ? 'jpg' : 'img';
    const path = `agency-logos/${agent.id}.${ext}`;
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(bytes), { contentType: logo.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    agency.logo_path = path;
    agency.logo_type = logo.type;
  }

  const { error } = await supabaseAdmin.from('users').update({ agency }).eq('id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, has_logo: !!agency.logo_path });
}
