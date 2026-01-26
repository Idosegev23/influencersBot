import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';
import { requireAuth, requireAccountAccess } from '@/lib/auth/api-helpers';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`); // FIX: Match /api/influencer/auth cookie name
  return authCookie?.value === 'authenticated';
}

// GET - Get a single partnership by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id - for legacy influencers, account_id = influencer_id
    const accountId = influencer.id;

    // Check cookie auth first (for influencers)
    const isAuth = await checkAuth(username);
    if (!isAuth) {
      // No cookie auth - would need Supabase Auth, but that causes RLS loop
      // For now, require cookie auth only
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get partnership
    const { data: partnership, error } = await supabase
      .from('partnerships')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !partnership) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    return NextResponse.json({ partnership });
  } catch (error) {
    console.error('Get partnership error:', error);
    return NextResponse.json({ error: 'Failed to fetch partnership' }, { status: 500 });
  }
}

// PATCH - Update a partnership
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { username, ...updates } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
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

    // Get account_id - for legacy influencers, account_id = influencer_id
    const accountId = influencer.id;

    // Verify partnership belongs to this account
    const { data: existing } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== accountId) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    // Sanitize text fields
    const sanitizedUpdates: Record<string, unknown> = {};
    
    if (updates.brand_name !== undefined) {
      sanitizedUpdates.brand_name = sanitizeHtml(updates.brand_name);
    }
    if (updates.brand_contact_name !== undefined) {
      sanitizedUpdates.brand_contact_name = updates.brand_contact_name ? sanitizeHtml(updates.brand_contact_name) : null;
    }
    if (updates.brand_contact_email !== undefined) {
      sanitizedUpdates.brand_contact_email = updates.brand_contact_email || null;
    }
    if (updates.brand_contact_phone !== undefined) {
      sanitizedUpdates.brand_contact_phone = updates.brand_contact_phone || null;
    }
    if (updates.status !== undefined) {
      sanitizedUpdates.status = updates.status;
    }
    if (updates.proposal_amount !== undefined) {
      sanitizedUpdates.proposal_amount = updates.proposal_amount || null;
    }
    if (updates.contract_amount !== undefined) {
      sanitizedUpdates.contract_amount = updates.contract_amount || null;
    }
    if (updates.currency !== undefined) {
      sanitizedUpdates.currency = updates.currency || 'ILS';
    }
    if (updates.brief !== undefined) {
      sanitizedUpdates.brief = updates.brief ? sanitizeHtml(updates.brief) : null;
    }
    if (updates.deliverables !== undefined) {
      sanitizedUpdates.deliverables = updates.deliverables || [];
    }
    if (updates.proposal_date !== undefined) {
      sanitizedUpdates.proposal_date = updates.proposal_date || null;
    }
    if (updates.contract_signed_date !== undefined) {
      sanitizedUpdates.contract_signed_date = updates.contract_signed_date || null;
    }
    if (updates.start_date !== undefined) {
      sanitizedUpdates.start_date = updates.start_date || null;
    }
    if (updates.end_date !== undefined) {
      sanitizedUpdates.end_date = updates.end_date || null;
    }
    if (updates.notes !== undefined) {
      sanitizedUpdates.notes = updates.notes ? sanitizeHtml(updates.notes) : null;
    }
    if (updates.tags !== undefined) {
      sanitizedUpdates.tags = updates.tags || [];
    }

    // Update partnership
    const { data: partnership, error } = await supabase
      .from('partnerships')
      .update(sanitizedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update partnership' }, { status: 500 });
    }

    return NextResponse.json({ partnership });
  } catch (error) {
    console.error('Update partnership error:', error);
    return NextResponse.json({ error: 'Failed to update partnership' }, { status: 500 });
  }
}

// DELETE - Delete a partnership
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
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

    // Get account_id - for legacy influencers, account_id = influencer_id
    const accountId = influencer.id;

    // Verify partnership belongs to this account
    const { data: existing } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', id)
      .single();

    if (!existing || existing.account_id !== accountId) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    // Delete partnership (this will cascade delete related contracts, invoices, etc.)
    const { error } = await supabase
      .from('partnerships')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to delete partnership' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete partnership error:', error);
    return NextResponse.json({ error: 'Failed to delete partnership' }, { status: 500 });
  }
}

