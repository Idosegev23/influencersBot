import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/communications
 * שליפת כל השיחות עם מותגים
 */
export async function GET(request: NextRequest) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  
  // Filters
  const category = searchParams.get('category'); // financial, legal, issues, general
  const status = searchParams.get('status'); // open, waiting_response, etc.
  const partnershipId = searchParams.get('partnership_id');
  const accountId = auth.accountId; // Use accountId from auth
  
  // Pagination
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('brand_communications')
      .select(`
        *,
        partnership:partnerships(id, brand_name, status)
      `, { count: 'exact' })
      .eq('account_id', accountId) // Always filter by current account
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply additional filters
    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (partnershipId) {
      query = query.eq('partnership_id', partnershipId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    // Return empty array if no data (not an error)
    return NextResponse.json({
      communications: data || [],
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
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  const body = await request.json();
  const accountId = auth.accountId;

  const {
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
  if (!subject || !category || !brand_name || !initial_message) {
    return NextResponse.json(
      { error: 'Missing required fields: subject, category, brand_name, initial_message' },
      { status: 400 }
    );
  }

  try {
    // Create communication
    const { data: communication, error: commError } = await supabase
      .from('brand_communications')
      .insert({
        account_id: accountId,
        partnership_id: partnership_id || null,
        subject,
        category,
        priority: priority || 'normal',
        brand_name,
        brand_contact_name: brand_contact_name || null,
        brand_contact_email: brand_contact_email || null,
        brand_contact_phone: brand_contact_phone || null,
        status: 'open',
        due_date: due_date || null,
        tags: tags || [],
        related_invoice_id: related_invoice_id || null,
        related_document_id: related_document_id || null,
        related_task_id: related_task_id || null,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (commError) {
      console.error('Error creating communication:', commError);
      throw commError;
    }

    if (!communication) {
      throw new Error('Communication created but not returned from database');
    }

    // Add initial message
    const { error: msgError } = await supabase
      .from('communication_messages')
      .insert({
        communication_id: communication.id,
        sender_type: 'influencer',
        sender_name: auth.influencer?.full_name || auth.username || 'Influencer',
        message_text: initial_message,
        is_read: true, // Mark as read since sender is influencer
      });

    if (msgError) {
      console.error('Error creating initial message:', msgError);
      // Don't throw - communication was created successfully
      // Just log the error
    }

    return NextResponse.json({ communication }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating communication:', error);
    return NextResponse.json(
      { error: 'שגיאה ביצירת התקשורת', details: error.message },
      { status: 500 }
    );
  }
}
