'use client';

/**
 * Document Upload Page - העלאת מסמכים חדשים
 * 
 * Flow:
 * 1. בחירת סוג מסמך
 * 2. העלאת קבצים (drag & drop)
 * 3. התקדמות (upload → parsing)
 * 4. סיכום והצלחה
 * 5. ניווט לדף סקירה (review)
 * 
 * Features:
 * - Multiple file upload
 * - Real-time progress
 * - Error handling + retry
 * - Auto-parse after upload
 * - Redirect to review page
 */

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  FileUploader,
  type UploadedFile,
} from '@/components/documents/FileUploader';
import {
  UploadProgressList,
  type Upload,
  type UploadStatus,
} from '@/components/documents/UploadProgress';
import {
  ValidationErrors,
  type ValidationError,
} from '@/components/documents/ValidationErrors';
import {
  DocumentTypeSelector,
  type DocumentType,
} from '@/components/documents/DocumentTypeSelector';

export default function DocumentUploadPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  // State
  const [documentType, setDocumentType] = useState<DocumentType>('general');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  // Handle upload complete
  const handleUploadComplete = async (files: UploadedFile[]) => {
    console.log('[Upload] Files uploaded:', files);
    
    // Add to uploaded documents list
    setUploadedDocuments((prev) => [...prev, ...files]);

    // Remove from uploads (clear progress)
    setUploads((prev) =>
      prev.filter((u) => !files.some((f) => f.filename === u.fileName))
    );

    // Auto-parse uploaded files
    await parseDocuments(files.map((f) => f.id));
  };

  // Handle upload error
  const handleUploadError = (error: string) => {
    console.error('[Upload] Error:', error);
    
    setErrors((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'network',
        message: error,
        canRetry: true,
      },
    ]);
  };

  // Parse uploaded documents
  const parseDocuments = async (documentIds: string[]) => {
    setIsParsing(true);

    try {
      // Update progress to parsing
      documentIds.forEach((docId) => {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === docId
              ? { ...u, status: 'parsing', progress: 75 }
              : u
          )
        );
      });

      // TODO: Get accountId from auth/context
      const accountId = 'temp-account-id'; // Replace with actual accountId

      const response = await fetch('/api/influencer/documents/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds,
          accountId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Parsing failed');
      }

      const result = await response.json();
      console.log('[Parse] Success:', result);

      // Mark as complete
      documentIds.forEach((docId) => {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === docId
              ? { ...u, status: 'complete', progress: 100 }
              : u
          )
        );
      });

      // Redirect to review page after a short delay
      setTimeout(() => {
        router.push(`/influencer/${username}/documents/review`);
      }, 2000);
    } catch (error: any) {
      console.error('[Parse] Error:', error);
      
      setErrors((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'ai_parsing',
          message: error.message || 'AI לא הצליח לנתח את המסמך',
          canRetry: true,
        },
      ]);

      // Mark as error
      documentIds.forEach((docId) => {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === docId
              ? { ...u, status: 'error', error: error.message }
              : u
          )
        );
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Dismiss error
  const handleDismissError = (errorId: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== errorId));
  };

  // Retry upload/parse
  const handleRetryError = (errorId: string) => {
    // TODO: Implement retry logic
    handleDismissError(errorId);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/influencer/${username}/partnerships`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לשת"פים
        </Link>

        <h1 className="text-3xl font-bold text-gray-900">
          העלאת מסמך חדש
        </h1>
        <p className="text-gray-600 mt-2">
          העלה מסמכים והמערכת תנתח אותם אוטומטית עם AI
        </p>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Step 1: Document Type */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
              1
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              בחר סוג מסמך
            </h2>
          </div>

          <DocumentTypeSelector
            value={documentType}
            onChange={setDocumentType}
          />
        </div>

        {/* Step 2: Upload Files */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
              2
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              העלה קבצים
            </h2>
          </div>

          <FileUploader
            accountId="temp-account-id" // TODO: Replace with actual accountId from auth
            username={username}
            onUploadComplete={handleUploadComplete}
            onError={handleUploadError}
            multiple={true}
          />
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <ValidationErrors
            errors={errors}
            onRetry={handleRetryError}
            onDismiss={handleDismissError}
            onDismissAll={() => setErrors([])}
          />
        )}

        {/* Upload Progress */}
        {uploads.length > 0 && (
          <UploadProgressList
            uploads={uploads}
            onRetry={(id) => {
              // TODO: Implement retry logic
              console.log('Retry:', id);
            }}
            onCancel={(id) => {
              setUploads((prev) => prev.filter((u) => u.id !== id));
            }}
          />
        )}

        {/* Success Summary */}
        {uploadedDocuments.length > 0 && uploads.length === 0 && !isParsing && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  {uploadedDocuments.length} מסמכים הועלו בהצלחה!
                </h3>
                <p className="text-sm text-green-700 mb-4">
                  המסמכים נותחו בהצלחה. עבור לדף הסקירה לאישור הנתונים.
                </p>
                <Link
                  href={`/influencer/${username}/documents/review`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                >
                  עבור לסקירה
                  <ArrowRight className="h-4 w-4 rotate-180" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            💡 טיפים:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• ניתן להעלות מספר קבצים בו-זמנית</li>
            <li>• המערכת תנתח אוטומטית את המסמכים עם AI</li>
            <li>• תוכל לערוך את הנתונים לפני יצירת השת"פ</li>
            <li>• קבצים נתמכים: PDF, Word, Excel, תמונות</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
