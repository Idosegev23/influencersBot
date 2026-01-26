import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';

type RouteParams = {
  params: {
    id: string;
  };
};

/**
 * GET /api/influencer/communications/[id]
 * שליפת שיחה ספציפית + כל ההודעות
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const { id } = params;

  try {
    // Get communication
    const { data: communication, error: commError } = await supabase
      .from('brand_communications')
      .select(`
        *,
        partnership:partnerships(id, brand_name, campaign_name),
        account:accounts(id, name),
        related_invoice:invoices(id, invoice_number, amount, status),
        related_document:partnership_documents(id, file_name, document_type),
        related_task:tasks(id, title, status)
      `)
      .eq('id', id)
      .single();

    if (commError) throw commError;
    if (!communication) {
      return NextResponse.json({ error: 'Communication not found' }, { status: 404 });
    }

    // Get all messages
    const { data: messages, error: msgError } = await supabase
      .from('communication_messages')
      .select('*')
      .eq('communication_id', id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Mark unread messages as read
    await supabase
      .from('communication_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('communication_id', id)
      .eq('is_read', false)
      .neq('sender_type', 'influencer'); // Don't mark own messages

    return NextResponse.json({
      communication,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('Error fetching communication:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communication', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/influencer/communications/[id]
 * עדכון שיחה (status, priority, due_date, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const { id } = params;
  const body = await request.json();

  const {
    status,
    priority,
    due_date,
    tags,
    brand_contact_name,
    brand_contact_email,
    brand_contact_phone,
  } = body;

  try {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }
      if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      }
    }
    if (priority) updateData.priority = priority;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (tags) updateData.tags = tags;
    if (brand_contact_name) updateData.brand_contact_name = brand_contact_name;
    if (brand_contact_email) updateData.brand_contact_email = brand_contact_email;
    if (brand_contact_phone) updateData.brand_contact_phone = brand_contact_phone;

    const { data, error } = await supabase
      .from('brand_communications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ communication: data });
  } catch (error: any) {
    console.error('Error updating communication:', error);
    return NextResponse.json(
      { error: 'Failed to update communication', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/influencer/communications/[id]
 * מחיקת שיחה (soft delete - סגירה)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const { id } = params;

  try {
    // Soft delete - mark as closed
    const { data, error } = await supabase
      .from('brand_communications')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ communication: data });
  } catch (error: any) {
    console.error('Error deleting communication:', error);
    return NextResponse.json(
      { error: 'Failed to delete communication', details: error.message },
      { status: 500 }
    );
  }
}
