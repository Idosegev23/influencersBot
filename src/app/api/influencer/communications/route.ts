import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';

/**
 * GET /api/influencer/communications
 * שליפת כל השיחות עם מותגים
 */
export async function GET(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  
  // Filters
  const category = searchParams.get('category'); // financial, legal, issues, general
  const status = searchParams.get('status'); // open, waiting_response, etc.
  const partnershipId = searchParams.get('partnership_id');
  const accountId = searchParams.get('account_id');
  
  // Pagination
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('brand_communications')
      .select(`
        *,
        partnership:partnerships(id, brand_name, campaign_name),
        account:accounts(id, name)
      `, { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (partnershipId) {
      query = query.eq('partnership_id', partnershipId);
    }
    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      communications: data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching communications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communications', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/influencer/communications
 * יצירת שיחה חדשה עם מותג
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const body = await request.json();

  const {
    account_id,
    partnership_id,
    subject,
    category,
    priority,
    brand_name,
    brand_contact_name,
    brand_contact_email,
    brand_contact_phone,
    initial_message,
    due_date,
    tags,
    related_invoice_id,
    related_document_id,
    related_task_id,
  } = body;

  // Validation
  if (!account_id || !subject || !category || !brand_name || !initial_message) {
    return NextResponse.json(
      { error: 'Missing required fields: account_id, subject, category, brand_name, initial_message' },
      { status: 400 }
    );
  }

  try {
    // Create communication
    const { data: communication, error: commError } = await supabase
      .from('brand_communications')
      .insert({
        account_id,
        partnership_id,
        subject,
        category,
        priority: priority || 'normal',
        brand_name,
        brand_contact_name,
        brand_contact_email,
        brand_contact_phone,
        status: 'open',
        due_date,
        tags: tags || [],
        related_invoice_id,
        related_document_id,
        related_task_id,
        created_by: authCheck.user.id,
      })
      .select()
      .single();

    if (commError) throw commError;

    // Add initial message
    const { error: msgError } = await supabase
      .from('communication_messages')
      .insert({
        communication_id: communication.id,
        sender_type: 'influencer',
        sender_name: authCheck.user.name || 'Influencer',
        sender_email: authCheck.user.email,
        message_text: initial_message,
        created_by: authCheck.user.id,
      });

    if (msgError) throw msgError;

    return NextResponse.json({ communication }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating communication:', error);
    return NextResponse.json(
      { error: 'Failed to create communication', details: error.message },
      { status: 500 }
    );
  }
}
