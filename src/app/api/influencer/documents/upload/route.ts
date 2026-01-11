// Upload documents to Supabase Storage

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const accountId = formData.get('accountId') as string;
    const partnershipId = formData.get('partnershipId') as string | null;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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
          parsing_status: 'pending',
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
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      message: `${uploadedFiles.length} קבצים הועלו בהצלחה`,
    });

  } catch (error: any) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload files' },
      { status: 500 }
    );
  }
}

