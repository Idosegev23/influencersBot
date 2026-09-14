import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * POST - Save document metadata after client-side upload
 * This is a lightweight endpoint that only handles JSON (no file payload)
 * Used after files are uploaded directly to Supabase Storage from client
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[Metadata API] Request body:', JSON.stringify(body, null, 2));
    
    const {
      username,
      accountId,
      partnershipId,
      filename,
      fileSize,
      mimeType,
      storagePath,
      publicUrl,
      documentType,
    } = body;

    // Validate required fields
    if (!username || !accountId || !filename || !storagePath) {
      console.error('[Metadata API] Missing required fields:', { username, accountId, filename, storagePath });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Session required: admin, or the account's own influencer/support-agent
    // session. username↔accountId matching alone proves nothing — both are public.
    const isAdmin = (await requireAdminAuth()) === null;
    if (!isAdmin) {
      if (!(await checkInfluencerAuth(username))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const influencer = await getInfluencerByUsername(username);
      if (!influencer || influencer.id !== accountId) {
        return NextResponse.json({ error: 'Account mismatch' }, { status: 403 });
      }
    }

    // parse later downloads storage_path with the service role and indexes it
    // into this account's RAG, so a path into another tenant's folder would be
    // a cross-account read. Every client writes under `${accountId}/`.
    if (typeof storagePath !== 'string' || !storagePath.startsWith(`${accountId}/`) || storagePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 });
    }

    // Save document metadata to database
    console.log('[Metadata API] Inserting document:', {
      account_id: accountId,
      partnership_id: partnershipId || null,
      filename,
      file_size: fileSize,
      document_type: documentType || 'other',
    });

    const { data: document, error: dbError } = await supabase
      .from('partnership_documents')
      .insert({
        account_id: accountId,
        partnership_id: partnershipId || null,
        filename: filename,
        file_size: fileSize,
        mime_type: mimeType,
        storage_path: storagePath,
        // public_url removed - not in schema
        document_type: documentType || 'other',
        parsing_status: 'pending',
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Metadata API] Database error:', {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
      });
      return NextResponse.json(
        { 
          error: 'Failed to save document metadata',
          details: dbError.message,
          code: dbError.code,
        },
        { status: 500 }
      );
    }

    console.log('[Metadata API] ✅ Document saved:', document.id);

    // No parse trigger here. Every caller of this route calls
    // /api/influencer/documents/parse itself once the upload is registered
    // (and some need the parse result synchronously), so triggering it here
    // too parsed — and billed — every file twice.

    return NextResponse.json({
      success: true,
      document,
      message: 'מסמך נשמר בהצלחה',
    });
  } catch (error: any) {
    console.error('[Metadata API] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { 
        error: 'Failed to save document metadata',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
