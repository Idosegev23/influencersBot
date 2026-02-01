import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * POST /api/influencer/communications/[id]/messages
 * שליחת הודעה חדשה בשיחה
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) {
    console.error(`[Communication Messages POST] Unauthorized access attempt`);
    return auth.response!;
  }

  const { id: communicationId } = await params;
  const accountId = auth.accountId;
  const body = await request.json();
  
  console.log(`[Communication Messages POST] Sending message to communication ${communicationId}`);

  const { message_text, attachments } = body;

  // Validation
  if (!message_text) {
    return NextResponse.json(
      { error: 'Missing required field: message_text' },
      { status: 400 }
    );
  }

  try {
    // Verify communication exists and user has access
    const { data: communication, error: commError } = await supabase
      .from('brand_communications')
      .select('id, status, account_id')
      .eq('id', communicationId)
      .eq('account_id', accountId)
      .single();

    if (commError) {
      console.error(`[Communication Messages POST] Database error:`, commError);
      throw commError;
    }
    
    if (!communication) {
      console.error(`[Communication Messages POST] Communication ${communicationId} not found or unauthorized`);
      return NextResponse.json({ error: 'התקשורת לא נמצאה' }, { status: 404 });
    }

    // Insert message
    const { data: message, error: msgError } = await supabase
      .from('communication_messages')
      .insert({
        communication_id: communicationId,
        sender_type: 'influencer',
        sender_name: auth.influencer?.full_name || auth.username || 'Influencer',
        message_text,
        attachments: attachments || [],
        is_read: true, // Sender's own message is marked as read
      })
      .select()
      .single();

    if (msgError) {
      console.error(`[Communication Messages POST] Error creating message:`, msgError);
      throw msgError;
    }

    // Update communication last_message_at and reopen if closed
    const updateData: any = {
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    if (communication.status === 'closed') {
      updateData.status = 'open';
      console.log(`[Communication Messages POST] Reopening closed communication ${communicationId}`);
    }
    
    await supabase
      .from('brand_communications')
      .update(updateData)
      .eq('id', communicationId);

    console.log(`[Communication Messages POST] Successfully sent message to ${communicationId}`);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error: any) {
    console.error('[Communication Messages POST] Error:', error);
    return NextResponse.json(
      { error: 'שגיאה בשליחת ההודעה', details: error.message },
      { status: 500 }
    );
  }
}
