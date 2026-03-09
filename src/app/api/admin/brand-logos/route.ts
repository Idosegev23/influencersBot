import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const COOKIE_NAME = 'influencerbot_admin_session';

async function isAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === 'authenticated';
}

// GET - list all brand logos
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('brand_logos')
    .select(`
      *,
      partnerships:partnerships!brand_logo_id(id, brand_name, account_id)
    `)
    .order('display_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brands: data });
}

// POST - upload logo for a brand
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  const formData = await req.formData();
  const brandId = formData.get('brandId') as string;
  const file = formData.get('logo') as File;

  if (!brandId || !file) {
    return NextResponse.json({ error: 'brandId and logo file required' }, { status: 400 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${brandId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await sb.storage
    .from('brand-logos')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = sb.storage
    .from('brand-logos')
    .getPublicUrl(fileName);

  // Update brand_logos table
  const { error: updateError } = await sb
    .from('brand_logos')
    .update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', brandId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, logo_url: urlData.publicUrl });
}

// PATCH - update brand contact info (phone, email, website)
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  const { brandId, whatsapp_phone, email, website } = await req.json();

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (whatsapp_phone !== undefined) updates.whatsapp_phone = whatsapp_phone || null;
  if (email !== undefined) updates.email = email || null;
  if (website !== undefined) updates.website = website || null;

  const { error } = await sb
    .from('brand_logos')
    .update(updates)
    .eq('id', brandId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE - remove logo from a brand
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  const { brandId } = await req.json();

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 });
  }

  // Get current logo info
  const { data: brand } = await sb
    .from('brand_logos')
    .select('id, brand_name_normalized, logo_url')
    .eq('id', brandId)
    .single();

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // If logo is in our storage, delete the file
  if (brand.logo_url?.includes('brand-logos')) {
    const path = brand.logo_url.split('brand-logos/').pop();
    if (path) {
      await sb.storage.from('brand-logos').remove([path]);
    }
  }

  // Clear logo_url
  await sb
    .from('brand_logos')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', brandId);

  return NextResponse.json({ success: true });
}
