import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`);
  return authCookie?.value === 'authenticated';
}

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

    // Check authentication (optional - allow unauthenticated for new partnership creation flow)
    const isAuth = await checkAuth(username);
    
    // If not authenticated via cookie, verify influencer exists and accountId is valid
    if (!isAuth) {
      const influencer = await getInfluencerByUsername(username);
      if (!influencer) {
        return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
      }

      // Verify accountId matches
      if (influencer.id !== accountId) {
        return NextResponse.json({ error: 'Account mismatch' }, { status: 403 });
      }
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
        public_url: publicUrl,
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

    // Trigger AI parsing asynchronously (optional)
    if (process.env.NEXT_PUBLIC_APP_URL) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/influencer/documents/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          documentType: documentType || 'other',
        }),
      }).catch(err => console.error('Failed to trigger parsing:', err));
    }

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
