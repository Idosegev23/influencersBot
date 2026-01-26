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
      // Note: This API doesn't exist yet, we'll create it
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
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">מסמכים</h1>
        <p className="text-gray-600 mt-2">
          כל המסמכים שלך - חוזים, הצעות מחיר, בריפים ועוד
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סה"כ מסמכים</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הצעות מחיר</div>
          <div className="text-2xl font-bold text-blue-600">{stats.quotes}</div>
        </div>

        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">חוזים</div>
          <div className="text-2xl font-bold text-green-600">{stats.contracts}</div>
        </div>

        <div className="bg-white border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">בריפים</div>
          <div className="text-2xl font-bold text-purple-600">{stats.briefs}</div>
        </div>

        <div className="bg-white border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">חשבוניות</div>
          <div className="text-2xl font-bold text-orange-600">{stats.invoices}</div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">נותחו</div>
          <div className="text-2xl font-bold text-emerald-600">{stats.parsed}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-right"
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {filteredDocuments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-lg text-gray-600 mb-2">אין מסמכים עדיין</p>
          <p className="text-sm text-gray-500">
            המסמכים מועלים דרך שת"פ בודד
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
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
                    className="w-10 h-10 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                    {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                  </span>
                </div>

                {/* Parsing Status */}
                {doc.parsing_status === 'completed' && doc.parsing_confidence && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                    AI: {(doc.parsing_confidence * 100).toFixed(0)}%
                  </span>
                )}
                {doc.parsing_status === 'pending' && (
                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                    ⏳ ממתין
                  </span>
                )}
                {doc.parsing_status === 'processing' && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    🔄 מנתח
                  </span>
                )}
              </div>

              {/* Filename */}
              <h3 className="font-medium text-gray-900 text-right mb-2 truncate">
                {doc.filename}
              </h3>

              {/* Metadata */}
              <div className="text-xs text-gray-500 text-right space-y-1">
                <p>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</p>
                <p>{new Date(doc.uploaded_at).toLocaleDateString('he-IL')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
