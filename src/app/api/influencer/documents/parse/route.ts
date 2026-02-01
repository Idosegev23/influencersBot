// Parse uploaded documents with AI

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseDocument, mergeDocuments } from '@/lib/ai-parser';
import type { DocumentType, ParseResult } from '@/lib/ai-parser/types';

// Gemini 3 Pro is powerful but slow - allow 8 minutes for parsing
export const maxDuration = 480; // 8 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, documentIds, documentType } = body;

    // Support both single document and multiple documents
    const idsToProcess = documentId ? [documentId] : documentIds;

    if (!idsToProcess || idsToProcess.length === 0) {
      return NextResponse.json(
        { error: 'documentId or documentIds required' },
        { status: 400 }
      );
    }

    console.log(`[Parse API] Starting parse for ${idsToProcess.length} document(s)`);

    // Fetch documents from database
    const { data: documents, error: fetchError } = await supabase
      .from('partnership_documents')
      .select('*')
      .in('id', idsToProcess);

    if (fetchError) {
      console.error('[Parse API] Database fetch error:', fetchError);
      return NextResponse.json(
        { error: 'שגיאה בטעינת המסמך מהמסד נתונים', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!documents || documents.length === 0) {
      console.error(`[Parse API] No documents found for IDs: ${idsToProcess.join(', ')}`);
      return NextResponse.json(
        { error: 'המסמכים לא נמצאו' },
        { status: 404 }
      );
    }

    const parseResults: ParseResult[] = [];

    // Parse each document
    for (const doc of documents) {
      console.log(`[Parse API] Processing document ${doc.id}: ${doc.filename} (type: ${doc.document_type})`);

      // Update status to processing
      await supabase
        .from('partnership_documents')
        .update({ parsing_status: 'processing' })
        .eq('id', doc.id);

      try {
        // Download file from Supabase Storage
        console.log(`[Parse API] Downloading from storage: ${doc.storage_path}`);
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('partnership-documents')
          .download(doc.storage_path);

        if (downloadError) {
          console.error(`[Parse API] Storage download error for ${doc.id}:`, downloadError);
          throw new Error(`שגיאה בהורדת הקובץ: ${downloadError.message}`);
        }

        if (!fileData) {
          throw new Error('הקובץ ריק או לא נמצא באחסון');
        }

        console.log(`[Parse API] File downloaded successfully, size: ${fileData.size} bytes`);

        // Convert blob to File
        const file = new File([fileData], doc.filename, { type: doc.mime_type });

        // Parse with AI
        console.log(`[Parse API] Starting AI parsing for ${doc.id}...`);
        const result = await parseDocument({
          file,
          documentType: doc.document_type as DocumentType,
          language: 'auto',
        });

        console.log(`[Parse API] AI parsing ${result.success ? 'succeeded' : 'failed'} for ${doc.id}, confidence: ${result.confidence}%`);
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
        console.error(`[Parse API] Error details:`, {
          message: error.message,
          stack: error.stack,
          documentId: doc.id,
          filename: doc.filename,
          documentType: doc.document_type,
        });

        // Update status to failed with error message
        await supabase
          .from('partnership_documents')
          .update({
            parsing_status: 'failed',
            parsed_at: new Date().toISOString(),
            parsing_error: error.message || 'Unknown error',
          })
          .eq('id', doc.id);

        // Log the failed attempt
        await supabase.from('ai_parsing_logs').insert({
          document_id: doc.id,
          attempt_number: 1,
          model_used: 'none',
          success: false,
          extracted_data: {},
          confidence_score: 0,
          error_message: error.message || 'Unknown error',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: 0,
        });

        parseResults.push({
          success: false,
          data: null,
          confidence: 0,
          model: 'manual',
          attemptNumber: 1,
          error: error.message || 'שגיאה לא ידועה בניתוח המסמך',
        });
      }
    }

    // Merge all parsed documents
    const mergedData = mergeDocuments(parseResults);

    const successCount = parseResults.filter(r => r.success).length;
    const failedCount = parseResults.filter(r => !r.success).length;

    console.log(`[Parse API] Parsing complete: ${successCount} succeeded, ${failedCount} failed`);

    // If all parsing failed, return more helpful error
    if (failedCount === parseResults.length) {
      const errorMessages = parseResults.map(r => r.error).filter(Boolean).join('; ');
      console.error(`[Parse API] All parsing attempts failed:`, errorMessages);
      
      return NextResponse.json({
        success: false,
        error: 'הניתוח נכשל',
        details: errorMessages || 'לא הצלחנו לנתח את המסמך. אנא נסה למלא את הפרטים באופן ידני.',
        results: parseResults,
        canFallbackToManual: true,
      }, { status: 200 }); // 200 to allow frontend to handle gracefully
    }

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
      canFallbackToManual: failedCount > 0 || mergedData.confidence < 75,
    });

  } catch (error: any) {
    console.error('[Parse API] Unexpected error:', error);
    console.error('[Parse API] Error stack:', error.stack);
    return NextResponse.json(
      { 
        error: 'שגיאה בניתוח המסמך',
        details: error.message || 'אירעה שגיאה בלתי צפויה', 
        canFallbackToManual: true 
      },
      { status: 500 }
    );
  }
}

