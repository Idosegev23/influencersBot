import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getInfluencerByUsername } from '@/lib/supabase';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`);
  return authCookie?.value === 'authenticated';
}

// POST - Upload/update brand logo (global, stored in brand_logos)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await params;
    const formData = await req.formData();
    const username = formData.get('username') as string;
    const file = formData.get('logo') as File;

    if (!username || !file) {
      return NextResponse.json({ error: 'username and logo file required' }, { status: 400 });
    }

    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    const sb = getSupabase();

    // Verify partnership belongs to this account
    const { data: partnership } = await sb
      .from('partnerships')
      .select('id, account_id, brand_name, brand_logo_id')
      .eq('id', partnershipId)
      .eq('account_id', influencer.id)
      .single();

    if (!partnership) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    let brandLogoId = partnership.brand_logo_id;

    // If no brand_logo record exists yet, create one
    if (!brandLogoId) {
      const normalized = partnership.brand_name.toLowerCase().replace(/[^a-z0-9א-ת]/g, '-').replace(/-+/g, '-');
      const { data: newBrand, error: createErr } = await sb
        .from('brand_logos')
        .insert({
          brand_name_normalized: normalized,
          display_name: partnership.brand_name,
        })
        .select('id')
        .single();

      if (createErr || !newBrand) {
        return NextResponse.json({ error: 'Failed to create brand record' }, { status: 500 });
      }

      brandLogoId = newBrand.id;

      // Link partnership to the new brand_logo
      await sb
        .from('partnerships')
        .update({ brand_logo_id: brandLogoId })
        .eq('id', partnershipId);
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${brandLogoId}.${ext}`;
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
    await sb
      .from('brand_logos')
      .update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', brandLogoId);

    return NextResponse.json({
      success: true,
      logo_url: urlData.publicUrl,
      brand_logo_id: brandLogoId,
    });
  } catch (error) {
    console.error('Brand logo upload error:', error);
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
  }
}
