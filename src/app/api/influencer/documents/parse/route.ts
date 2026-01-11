// Parse uploaded documents with AI

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseDocument, mergeDocuments } from '@/lib/ai-parser';
import type { DocumentType, ParseResult } from '@/lib/ai-parser/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentIds, accountId } = body;

    if (!accountId || !documentIds || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'accountId and documentIds are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch documents from database
    const { data: documents, error: fetchError } = await supabase
      .from('partnership_documents')
      .select('*')
      .in('id', documentIds)
      .eq('account_id', accountId);

    if (fetchError) {
      throw fetchError;
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { error: 'No documents found' },
        { status: 404 }
      );
    }

    const parseResults: ParseResult[] = [];

    // Parse each document
    for (const doc of documents) {
      console.log(`[Parse API] Processing document: ${doc.filename}`);

      // Update status to processing
      await supabase
        .from('partnership_documents')
        .update({ parsing_status: 'processing' })
        .eq('id', doc.id);

      try {
        // Download file from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('partnership-documents')
          .download(doc.storage_path);

        if (downloadError) {
          throw downloadError;
        }

        // Convert blob to File
        const file = new File([fileData], doc.filename, { type: doc.mime_type });

        // Parse with AI
        const result = await parseDocument({
          file,
          documentType: doc.document_type as DocumentType,
          language: 'auto',
        });

        parseResults.push(result);

        // Update document with parsing results
        await supabase
          .from('partnership_documents')
          .update({
            parsing_status: result.success ? 'completed' : 'failed',
            parsed_data: result.data || {},
            parsing_confidence: result.confidence,
            ai_model_used: result.model,
            parsed_at: new Date().toISOString(),
          })
          .eq('id', doc.id);

        // Log parsing attempt
        await supabase.from('ai_parsing_logs').insert({
          document_id: doc.id,
          attempt_number: result.attemptNumber,
          model_used: result.model,
          success: result.success,
          extracted_data: result.data || {},
          confidence_score: result.confidence,
          error_message: result.error || null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: result.duration_ms || 0,
        });

      } catch (error: any) {
        console.error(`[Parse API] Error parsing ${doc.filename}:`, error);

        // Update status to failed
        await supabase
          .from('partnership_documents')
          .update({
            parsing_status: 'failed',
            parsed_at: new Date().toISOString(),
          })
          .eq('id', doc.id);

        parseResults.push({
          success: false,
          data: null,
          confidence: 0,
          model: 'manual',
          attemptNumber: 1,
          error: error.message,
        });
      }
    }

    // Merge all parsed documents
    const mergedData = mergeDocuments(parseResults);

    const successCount = parseResults.filter(r => r.success).length;
    const failedCount = parseResults.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      results: parseResults,
      mergedData,
      summary: {
        total: parseResults.length,
        succeeded: successCount,
        failed: failedCount,
        averageConfidence: mergedData.confidence,
      },
      message: `${successCount} מסמכים נותחו בהצלחה${failedCount > 0 ? `, ${failedCount} דורשים סקירה ידנית` : ''}`,
    });

  } catch (error: any) {
    console.error('[Parse API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse documents' },
      { status: 500 }
    );
  }
}

