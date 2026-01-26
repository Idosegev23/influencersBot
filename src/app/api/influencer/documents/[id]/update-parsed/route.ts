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
      user.id,
      document.account_id,
      'update'
    );
    if (!accessResult.success) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status }
      );
    }

    // Parse request body
    const { field, value } = await request.json();

    if (!field) {
      return NextResponse.json(
        { error: 'שדה חובה חסר' },
        { status: 400 }
      );
    }

    // Update parsed_data
    const currentParsedData = document.parsed_data || {};
    const updatedParsedData = {
      ...currentParsedData,
      [field]: value,
    };

    // Update in database
    const { error: updateError } = await supabase
      .from('partnership_documents')
      .update({
        parsed_data: updatedParsedData,
        updated_at: new Date().toISOString(),
      })
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
      parsed_data: updatedParsedData,
    });
  } catch (error) {
    console.error('Error in PATCH /api/influencer/documents/[id]/update-parsed:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
