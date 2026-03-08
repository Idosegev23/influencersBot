'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Document {
  id: string;
  filename: string;
  document_type: string;
  file_size: number;
  parsing_status: string;
  parsing_confidence: number | null;
  uploaded_at: string;
  partnership_id: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  quote: 'הצעת מחיר',
  contract: 'חוזה',
  brief: 'בריף',
  invoice: 'חשבונית',
  receipt: 'קבלה',
  other: 'אחר',
};

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get all documents for this influencer
      const response = await fetch(
        `/api/influencer/documents?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const result = await response.json();
      setDocuments(result.documents || []);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('שגיאה בטעינת המסמכים');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredDocuments = documents.filter(
    (doc) => typeFilter === 'all' || doc.document_type === typeFilter
  );

  const stats = {
    total: documents.length,
    quotes: documents.filter((d) => d.document_type === 'quote').length,
    contracts: documents.filter((d) => d.document_type === 'contract').length,
    briefs: documents.filter((d) => d.document_type === 'brief').length,
    invoices: documents.filter((d) => d.document_type === 'invoice').length,
    parsed: documents.filter((d) => d.parsing_status === 'completed').length,
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-1/4" style={{ background: 'var(--dash-surface)' }} />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded" style={{ background: 'var(--dash-surface)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>מסמכים</h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>
            כל המסמכים שלך - חוזים, הצעות מחיר, בריפים ועוד
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>סה"כ מסמכים</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{stats.total}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>הצעות מחיר</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.quotes}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>חוזים</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>{stats.contracts}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>בריפים</div>
            <div className="text-2xl font-bold text-purple-400">{stats.briefs}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>חשבוניות</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{stats.invoices}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>נותחו</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>{stats.parsed}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 rounded-lg text-right"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-border)' }}
          >
            <option value="all">כל הסוגים</option>
            <option value="quote">הצעות מחיר</option>
            <option value="contract">חוזים</option>
            <option value="brief">בריפים</option>
            <option value="invoice">חשבוניות</option>
            <option value="receipt">קבלות</option>
            <option value="other">אחר</option>
          </select>
        </div>

        {/* Documents Grid */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        {filteredDocuments.length === 0 ? (
          <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
            <svg
              className="w-16 h-16 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: 'var(--dash-text-3)' }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg mb-2" style={{ color: 'var(--dash-text-2)' }}>אין מסמכים עדיין</p>
            <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>
              המסמכים מועלים דרך שת"פ בודד
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border p-4 transition-shadow cursor-pointer"
                style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
                onClick={() => {
                  if (doc.parsing_status === 'completed') {
                    router.push(`/influencer/${username}/documents/${doc.id}/review`);
                  } else {
                    router.push(
                      `/influencer/${username}/partnerships/${doc.partnership_id}`
                    );
                  }
                }}
              >
                {/* File Icon & Type */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-10 h-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: 'var(--color-info)' }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--dash-surface-hover)', color: 'var(--dash-text-2)' }}>
                      {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                    </span>
                  </div>

                  {/* Parsing Status */}
                  {doc.parsing_status === 'completed' && doc.parsing_confidence && (
                    <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                      AI: {(doc.parsing_confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {doc.parsing_status === 'pending' && (
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--color-warning) 20%, transparent)', color: 'var(--color-warning)' }}>
                      ⏳ ממתין
                    </span>
                  )}
                  {doc.parsing_status === 'processing' && (
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--color-info) 20%, transparent)', color: 'var(--color-info)' }}>
                      🔄 מנתח
                    </span>
                  )}
                </div>

                {/* Filename */}
                <h3 className="font-medium text-right mb-2 truncate" style={{ color: 'var(--dash-text)' }}>
                  {doc.filename}
                </h3>

                {/* Metadata */}
                <div className="text-xs text-right space-y-1" style={{ color: 'var(--dash-text-3)' }}>
                  <p>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</p>
                  <p>{new Date(doc.uploaded_at).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
