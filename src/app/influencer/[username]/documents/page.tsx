'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  Database,
  ArrowRight,
} from 'lucide-react';
import {
  FileUploader,
  type UploadedFile,
} from '@/components/documents/FileUploader';

interface Document {
  id: string;
  filename: string;
  document_type: string;
  file_size: number;
  parsing_status: string;
  parsing_confidence: number | null;
  uploaded_at: string;
  partnership_id: string | null;
  rag_status?: string | null;
  rag_chunks_count?: number | null;
}

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/documents?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const result = await response.json();
      setDocuments(result.documents || []);

      if (!accountId) {
        const { getInfluencerByUsername } = await import('@/lib/supabase');
        const inf = await getInfluencerByUsername(username);
        if (inf) setAccountId(inf.id);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('שגיאה בטעינת המסמכים');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle upload complete → trigger parse + RAG
  const handleUploadComplete = useCallback(async (files: UploadedFile[]) => {
    setIsParsing(true);
    setUploadError(null);
    setParseSuccess(false);

    try {
      const response = await fetch('/api/influencer/documents/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds: files.map((f) => f.id),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'הניתוח נכשל');
      }

      setParseSuccess(true);
      await loadData();
      setTimeout(() => setParseSuccess(false), 5000);
    } catch (err: any) {
      setUploadError(err.message || 'שגיאה בניתוח המסמך');
    } finally {
      setIsParsing(false);
    }
  }, [username]);

  const handleUploadError = useCallback((error: string) => {
    setUploadError(error);
  }, []);

  const stats = {
    total: documents.length,
    indexed: documents.filter((d) => d.rag_status === 'indexed').length,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>מאגר מסמכים</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>
              העלה מסמכים למאגר המידע של הצ&#39;אטבוט
            </p>
          </div>
          <Link
            href={`/influencer/${username}/dashboard`}
            className="flex items-center gap-1 text-sm transition-colors"
            style={{ color: 'var(--dash-text-3)' }}
          >
            <ArrowRight className="w-4 h-4" />
            חזרה
          </Link>
        </div>

        {/* Upload Section */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
        >
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--dash-text)' }}>העלאת מסמך למאגר</h2>
          </div>

          <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
            המסמך ינותח אוטומטית, יפוצל לחלקים ויוזן למאגר הידע של הצ&#39;אטבוט. PDF, Word, Excel, תמונות (עד 10MB)
          </p>

          {/* File uploader */}
          {accountId && (
            <FileUploader
              accountId={accountId}
              username={username}
              documentType="other"
              onUploadComplete={handleUploadComplete}
              onError={handleUploadError}
              multiple={true}
            />
          )}

          {/* Parsing state */}
          {isParsing && (
            <div
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--color-info) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-info)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-info)' }}>מנתח ומאנדקס...</p>
                <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                  המסמך עובר ניתוח AI, פיצול לחלקים, והזנה למאגר הידע
                </p>
              </div>
            </div>
          )}

          {/* Parse success */}
          {parseSuccess && (
            <div
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--dash-positive) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--dash-positive) 30%, transparent)' }}
            >
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--dash-positive)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--dash-positive)' }}>המסמך נוסף למאגר בהצלחה!</p>
                <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                  התוכן זמין לשליפה בצ&#39;אטבוט כבר עכשיו
                </p>
              </div>
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--dash-negative, red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--dash-negative, red) 30%, transparent)' }}
            >
              <p className="text-sm" style={{ color: 'var(--dash-negative, red)' }}>{uploadError}</p>
              <button
                onClick={() => setUploadError(null)}
                className="mr-auto text-xs underline"
                style={{ color: 'var(--dash-text-3)' }}
              >
                סגור
              </button>
            </div>
          )}
        </div>

        {/* Stats strip */}
        {documents.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border p-4 text-center" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{stats.total}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>מסמכים במאגר</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.indexed}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>מאונדקסים בצ&#39;אטבוט</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg" style={{ background: 'color-mix(in srgb, var(--dash-negative, red) 10%, transparent)', color: 'var(--dash-negative, red)' }}>
            {error}
          </div>
        )}

        {/* Documents List */}
        {documents.length === 0 ? (
          <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--dash-text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>אין מסמכים במאגר עדיין</p>
            <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
              העלה מסמך למעלה והמערכת תוסיף אותו אוטומטית
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border p-4 flex items-center gap-4 transition-colors"
                style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
              >
                {/* Icon */}
                <FileText className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--color-info)' }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate" style={{ color: 'var(--dash-text)' }}>
                    {doc.filename}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                    <span>{(doc.file_size / 1024 / 1024).toFixed(1)} MB</span>
                    <span>{new Date(doc.uploaded_at).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* RAG status */}
                  {doc.rag_status === 'indexed' && (
                    <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: 'color-mix(in srgb, var(--dash-positive) 15%, transparent)', color: 'var(--dash-positive)' }}>
                      <Database className="w-3 h-3" />
                      {doc.rag_chunks_count || 0} חלקים
                    </span>
                  )}
                  {doc.rag_status === 'processing' && (
                    <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: 'color-mix(in srgb, var(--color-info) 15%, transparent)', color: 'var(--color-info)' }}>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      מאנדקס
                    </span>
                  )}
                  {doc.rag_status === 'failed' && (
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--dash-negative, red) 15%, transparent)', color: 'var(--dash-negative, red)' }}>
                      נכשל
                    </span>
                  )}
                  {doc.parsing_status === 'pending' && (
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' }}>
                      ממתין
                    </span>
                  )}
                  {doc.parsing_status === 'processing' && (
                    <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: 'color-mix(in srgb, var(--color-info) 15%, transparent)', color: 'var(--color-info)' }}>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      מנתח
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
