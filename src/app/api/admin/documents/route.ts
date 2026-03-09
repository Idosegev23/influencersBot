import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/documents?accountId=xxx - List documents for an account
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: documents, error } = await supabase
      .from('partnership_documents')
      .select('id, filename, file_size, mime_type, document_type, parsing_status, parsing_confidence, ai_model_used, uploaded_at, parsed_at')
      .eq('account_id', accountId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error: any) {
    console.error('[Admin Documents] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/documents?documentId=xxx - Delete a document
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch document to get storage path
    const { data: doc, error: fetchError } = await supabase
      .from('partnership_documents')
      .select('id, storage_path, account_id')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from Supabase Storage
    if (doc.storage_path) {
      await supabase.storage
        .from('partnership-documents')
        .remove([doc.storage_path]);
    }

    // Delete RAG documents and chunks for this source
    const { data: ragDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('source_id', documentId)
      .eq('entity_type', 'document');

    if (ragDocs && ragDocs.length > 0) {
      const ragDocIds = ragDocs.map(d => d.id);
      await supabase.from('document_chunks').delete().in('document_id', ragDocIds);
      await supabase.from('documents').delete().in('id', ragDocIds);
    }

    // Delete the document record
    const { error: deleteError } = await supabase
      .from('partnership_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Documents] Delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
