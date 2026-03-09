import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

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

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      console.error('FormData parse error:', e);
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const username = formData.get('username') as string;
    const file = formData.get('logo') as File;

    if (!username || !file) {
      return NextResponse.json({ error: 'username and logo file required' }, { status: 400 });
    }

    console.log('[brand-logo] Upload request:', { partnershipId, username, fileName: file.name, fileSize: file.size });

    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Verify partnership belongs to this account
    const { data: partnership, error: partnershipErr } = await supabase
      .from('partnerships')
      .select('id, account_id, brand_name, brand_logo_id')
      .eq('id', partnershipId)
      .eq('account_id', influencer.id)
      .single();

    if (partnershipErr || !partnership) {
      console.error('[brand-logo] Partnership lookup error:', partnershipErr);
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    let brandLogoId = partnership.brand_logo_id;

    // If no brand_logo record linked yet, find or create one
    if (!brandLogoId) {
      const normalized = partnership.brand_name.toLowerCase().replace(/[^a-z0-9א-ת]/g, '-').replace(/-+/g, '-');

      // First check if a brand_logos record already exists with this normalized name
      const { data: existingBrand } = await supabase
        .from('brand_logos')
        .select('id')
        .eq('brand_name_normalized', normalized)
        .single();

      if (existingBrand) {
        brandLogoId = existingBrand.id;
      } else {
        const { data: newBrand, error: createErr } = await supabase
          .from('brand_logos')
          .insert({
            brand_name_normalized: normalized,
            display_name: partnership.brand_name,
          })
          .select('id')
          .single();

        if (createErr || !newBrand) {
          console.error('[brand-logo] Failed to create brand_logos record:', createErr);
          return NextResponse.json({ error: 'Failed to create brand record: ' + (createErr?.message || 'unknown') }, { status: 500 });
        }

        brandLogoId = newBrand.id;
      }

      // Link partnership to the brand_logo
      await supabase
        .from('partnerships')
        .update({ brand_logo_id: brandLogoId })
        .eq('id', partnershipId);
    }

    console.log('[brand-logo] Using brandLogoId:', brandLogoId);

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${brandLogoId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('brand-logos')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[brand-logo] Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Storage upload failed: ' + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('brand-logos')
      .getPublicUrl(fileName);

    console.log('[brand-logo] Public URL:', urlData.publicUrl);

    // Update brand_logos table
    const { error: updateErr } = await supabase
      .from('brand_logos')
      .update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', brandLogoId);

    if (updateErr) {
      console.error('[brand-logo] brand_logos update error:', updateErr);
    }

    return NextResponse.json({
      success: true,
      logo_url: urlData.publicUrl,
      brand_logo_id: brandLogoId,
    });
  } catch (error) {
    console.error('[brand-logo] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to upload logo: ' + (error instanceof Error ? error.message : 'unknown') }, { status: 500 });
  }
}
