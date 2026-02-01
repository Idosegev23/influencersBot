import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth, requireAccountAccess } from '@/lib/auth/api-helpers';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await context.params;

    // Check authentication
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();
    const { user } = authResult;

    // Get document to verify ownership
    const { data: document, error: docError } = await supabase
      .from('partnership_documents')
      .select('account_id, parsed_data')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'מסמך לא נמצא' },
        { status: 404 }
      );
    }

    // Check access to account
    const accessResult = await requireAccountAccess(
      user,
      document.account_id
    );
    if (accessResult) {
      return accessResult;
    }

    // Parse request body
    const body = await request.json();
    const { field, value, partnership_id } = body;

    // Prepare update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    // Update partnership_id if provided
    if (partnership_id !== undefined) {
      updates.partnership_id = partnership_id;
      console.log(`[Update Document] Linking document ${documentId} to partnership ${partnership_id}`);
    }

    // Update parsed_data field if provided
    if (field) {
      const currentParsedData = document.parsed_data || {};
      updates.parsed_data = {
        ...currentParsedData,
        [field]: value,
      };
      console.log(`[Update Document] Updating parsed_data field: ${field}`);
    }

    // Update in database
    const { error: updateError } = await supabase
      .from('partnership_documents')
      .update(updates)
      .eq('id', documentId);

    if (updateError) {
      console.error('Error updating document:', updateError);
      return NextResponse.json(
        { error: 'שגיאה בעדכון המסמך' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updates,
    });
  } catch (error) {
    console.error('Error in PATCH /api/influencer/documents/[id]/update-parsed:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
