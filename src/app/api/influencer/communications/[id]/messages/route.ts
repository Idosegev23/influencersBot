import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';

/**
 * POST /api/influencer/communications/[id]/messages
 * שליחת הודעה חדשה בשיחה
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAuth(request);
  if (authCheck.error) {
    return authCheck.error;
  }

  const supabase = createClient();
  const { id: communicationId } = await params;
  const body = await request.json();

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
      .single();

    if (commError) throw commError;
    if (!communication) {
      return NextResponse.json({ error: 'Communication not found' }, { status: 404 });
    }

    // Insert message
    const { data: message, error: msgError } = await supabase
      .from('communication_messages')
      .insert({
        communication_id: communicationId,
        sender_type: 'influencer',
        sender_name: authCheck.user.name || 'Influencer',
        sender_email: authCheck.user.email,
        message_text,
        attachments: attachments || [],
        created_by: authCheck.user.id,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // Update communication status if closed
    if (communication.status === 'closed') {
      await supabase
        .from('brand_communications')
        .update({
          status: 'open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', communicationId);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message', details: error.message },
      { status: 500 }
    );
  }
}
