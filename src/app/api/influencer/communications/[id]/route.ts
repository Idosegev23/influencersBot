import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/communications/[id]
 * שליפת שיחה ספציפית + כל ההודעות
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    console.error(`[Communications GET] Unauthorized access attempt`);
    return auth.response!;
  }

  const { id } = await params;
  const accountId = auth.accountId;
  
  console.log(`[Communications GET] Fetching communication ${id} for account ${accountId}`);

  try {
    // Get communication and verify it belongs to this account
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
      .eq('account_id', accountId)
      .single();

    if (commError) {
      console.error(`[Communications GET] Database error:`, commError);
      throw commError;
    }
    
    if (!communication) {
      console.error(`[Communications GET] Communication ${id} not found or unauthorized`);
      return NextResponse.json({ error: 'התקשורת לא נמצאה' }, { status: 404 });
    }

    // Get all messages
    const { data: messages, error: msgError } = await supabase
      .from('communication_messages')
      .select('*')
      .eq('communication_id', id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error(`[Communications GET] Messages error:`, msgError);
      throw msgError;
    }

    // Mark unread messages as read
    await supabase
      .from('communication_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('communication_id', id)
      .eq('is_read', false)
      .neq('sender_type', 'influencer'); // Don't mark own messages

    console.log(`[Communications GET] Successfully fetched communication ${id} with ${messages?.length || 0} messages`);

    return NextResponse.json({
      communication,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('[Communications GET] Error:', error);
    return NextResponse.json(
      { error: 'שגיאה בטעינת התקשורת', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/influencer/communications/[id]
 * עדכון שיחה (status, priority, due_date, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    console.error(`[Communications PATCH] Unauthorized access attempt`);
    return auth.response!;
  }

  const { id } = await params;
  const accountId = auth.accountId;
  const body = await request.json();
  
  console.log(`[Communications PATCH] Updating communication ${id} for account ${accountId}`);

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
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      console.error(`[Communications PATCH] Database error:`, error);
      throw error;
    }

    console.log(`[Communications PATCH] Successfully updated communication ${id}`);
    return NextResponse.json({ communication: data });
  } catch (error: any) {
    console.error('[Communications PATCH] Error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון התקשורת', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/influencer/communications/[id]
 * מחיקת שיחה (soft delete - סגירה)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    console.error(`[Communications DELETE] Unauthorized access attempt`);
    return auth.response!;
  }

  const { id } = await params;
  const accountId = auth.accountId;
  
  console.log(`[Communications DELETE] Deleting communication ${id} for account ${accountId}`);

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
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      console.error(`[Communications DELETE] Database error:`, error);
      throw error;
    }

    console.log(`[Communications DELETE] Successfully deleted communication ${id}`);
    return NextResponse.json({ communication: data });
  } catch (error: any) {
    console.error('[Communications DELETE] Error:', error);
    return NextResponse.json(
      { error: 'שגיאה במחיקת התקשורת', details: error.message },
      { status: 500 }
    );
  }
}
