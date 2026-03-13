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

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
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

/** Map UI document types to AI parser document types */
function mapDocumentType(uiType: DocumentType): string {
  const map: Record<string, string> = {
    partnership_agreement: 'contract',
    invoice: 'invoice',
    brief: 'brief',
    proposal: 'quote',
    general: 'other',
  };
  return map[uiType] || 'other';
}

export default function DocumentUploadPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  // State
  const [accountId, setAccountId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('general');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  // Resolve accountId from username
  useEffect(() => {
    async function loadAccount() {
      const inf = await getInfluencerByUsername(username);
      if (inf) setAccountId(inf.id);
    }
    loadAccount();
  }, [username]);

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

      if (!accountId) return;

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
    <div className="min-h-screen" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="container mx-auto py-8 px-4 max-w-6xl animate-slide-up">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/influencer/${username}/partnerships`}
            className="inline-flex items-center gap-2 text-sm transition-colors mb-4"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <ArrowRight className="h-4 w-4" />
            חזרה לשת"פים
          </Link>

          <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>
            העלאת מסמך חדש
          </h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>
            העלה מסמכים והמערכת תנתח אותם אוטומטית עם AI
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Step 1: Document Type */}
          <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', color: 'var(--color-primary)' }}>
                1
              </div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>
                בחר סוג מסמך
              </h2>
            </div>

            <DocumentTypeSelector
              value={documentType}
              onChange={setDocumentType}
            />
          </div>

          {/* Step 2: Upload Files */}
          <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', color: 'var(--color-primary)' }}>
                2
              </div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>
                העלה קבצים
              </h2>
            </div>

            <FileUploader
              accountId={accountId || ''}
              username={username}
              documentType={mapDocumentType(documentType)}
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
            <div className="glass-card rounded-2xl p-6 animate-slide-up relative z-10" style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'var(--dash-glass-border)' }}>
              <div className="flex items-start gap-4">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" style={{ color: 'var(--dash-positive)' }} />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--dash-positive)' }}>
                    {uploadedDocuments.length} מסמכים הועלו בהצלחה!
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--dash-text-2)' }}>
                    המסמכים נותחו והוזנו למערכת הצ&#39;אטבוט. התוכן יהיה זמין לשליפה כבר מהסשן הבא.
                  </p>
                  <Link
                    href={`/influencer/${username}/documents/review`}
                    className="btn-teal inline-flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
                  >
                    עבור לסקירה
                    <ArrowRight className="h-4 w-4 rotate-180" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="glass-card rounded-2xl p-4 animate-fade-in relative z-10" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'var(--dash-glass-border)' }}>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-info)' }}>
              💡 טיפים:
            </h3>
            <ul className="text-sm space-y-1" style={{ color: 'var(--dash-text-2)' }}>
              <li>• ניתן להעלות מספר קבצים בו-זמנית</li>
              <li>• המערכת תנתח אוטומטית את המסמכים עם AI</li>
              <li>• התוכן יוזן אוטומטית לצ&#39;אטבוט ויהיה זמין לשליפה</li>
              <li>• תוכל לערוך את הנתונים לפני יצירת השת"פ</li>
              <li>• קבצים נתמכים: PDF, Word, Excel, תמונות</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
