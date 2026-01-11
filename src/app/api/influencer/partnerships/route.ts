import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_auth_${username}`);
  return authCookie?.value === 'authenticated';
}

// GET - List partnerships for an influencer with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id for this influencer
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('legacy_influencer_id', influencer.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('partnerships')
      .select('*', { count: 'exact' })
      .eq('account_id', account.id);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('start_date', startDate);
    }
    if (endDate) {
      query = query.lte('end_date', endDate);
    }

    // Apply pagination and ordering
    const { data: partnerships, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch partnerships' }, { status: 500 });
    }

    return NextResponse.json({ 
      partnerships: partnerships || [], 
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get partnerships error:', error);
    return NextResponse.json({ error: 'Failed to fetch partnerships' }, { status: 500 });
  }
}

// POST - Create a new partnership
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      username,
      brand_name,
      brand_contact_name,
      brand_contact_email,
      brand_contact_phone,
      status,
      proposal_amount,
      contract_amount,
      currency,
      brief,
      deliverables,
      proposal_date,
      contract_signed_date,
      start_date,
      end_date,
      notes,
      tags,
    } = body;

    if (!username || !brand_name) {
      return NextResponse.json({ error: 'Username and brand name are required' }, { status: 400 });
    }

    // Check authentication
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id for this influencer
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('legacy_influencer_id', influencer.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Create partnership
    const { data: partnership, error } = await supabase
      .from('partnerships')
      .insert({
        account_id: account.id,
        brand_name: sanitizeHtml(brand_name),
        brand_contact_name: brand_contact_name ? sanitizeHtml(brand_contact_name) : null,
        brand_contact_email: brand_contact_email || null,
        brand_contact_phone: brand_contact_phone || null,
        status: status || 'lead',
        proposal_amount: proposal_amount || null,
        contract_amount: contract_amount || null,
        currency: currency || 'ILS',
        brief: brief ? sanitizeHtml(brief) : null,
        deliverables: deliverables || [],
        proposal_date: proposal_date || null,
        contract_signed_date: contract_signed_date || null,
        start_date: start_date || null,
        end_date: end_date || null,
        notes: notes ? sanitizeHtml(notes) : null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create partnership' }, { status: 500 });
    }

    return NextResponse.json({ partnership }, { status: 201 });
  } catch (error) {
    console.error('Create partnership error:', error);
    return NextResponse.json({ error: 'Failed to create partnership' }, { status: 500 });
  }
}

