// Upload documents to Supabase Storage

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { getCurrentUser, checkPermission, isAccountOwner } from '@/lib/auth/middleware';

// Allow longer execution for large files (max 5 minutes on Pro plan)
export const maxDuration = 300;

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`);
  return authCookie?.value === 'authenticated';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const accountId = formData.get('accountId') as string;
    const partnershipId = formData.get('partnershipId') as string | null;
    const username = formData.get('username') as string | null;
    const documentType = formData.get('documentType') as string || 'other';

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    // Auth check: Support both cookie-based (influencer) and Supabase Auth (admin/agent)
    let isAuthenticated = false;

    if (username) {
      // Try cookie auth first
      isAuthenticated = await checkAuth(username);
    }

    if (!isAuthenticated) {
      // Try Supabase Auth (for admin/agent)
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Check document upload permission
      const canUpload = await checkPermission(user, {
        resource: 'documents',
        action: 'create',
      });

      if (!canUpload) {
        return NextResponse.json(
          { error: 'Forbidden - insufficient permissions' },
          { status: 403 }
        );
      }

      // Verify user owns this account
      const isOwner = await isAccountOwner(user, accountId);
      if (!isOwner) {
        return NextResponse.json(
          { error: 'Forbidden - not account owner' },
          { status: 403 }
        );
      }
    }
    // Cookie auth users can only upload to their own account (verified by cookie)

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const uploadedFiles = [];

    for (const file of files) {
      // Generate unique filename
      const timestamp = Date.now();
      const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${accountId}/documents/${timestamp}_${cleanFilename}`;

      // Upload to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('partnership-documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (storageError) {
        console.error('[Upload] Storage error:', storageError);
        throw storageError;
      }

      // Create document record in database
      const { data: document, error: dbError } = await supabase
        .from('partnership_documents')
        .insert({
          partnership_id: partnershipId || null,
          account_id: accountId,
          filename: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          document_type: documentType,
          parsing_status: 'pending',
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) {
        console.error('[Upload] DB error:', dbError);
        throw dbError;
      }

      uploadedFiles.push({
        id: document.id,
        filename: file.name,
        size: file.size,
        type: file.type,
        storagePath: storagePath,
      });

      // Trigger AI parsing asynchronously (don't await - let it run in background)
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/influencer/documents/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          documentType: documentType,
        }),
      }).catch(err => console.error('[Upload] Failed to trigger parsing:', err));
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      message: `${uploadedFiles.length} קבצים הועלו בהצלחה. ה-AI מתחיל לנתח...`,
    });

  } catch (error: any) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload files' },
      { status: 500 }
    );
  }
}

