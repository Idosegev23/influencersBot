'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Document {
  id: string;
  filename: string;
  document_type: string;
  parsing_status: string;
  parsed_data: any;
  parsing_confidence: number | null;
  ai_model_used: string | null;
  download_url: string | null;
}

export default function DocumentReviewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const documentId = params.id as string;

  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<any>({});

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/documents/${documentId}?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load document');
      }

      const result = await response.json();
      setDocument(result.document);
      setEditedData(result.document.parsed_data || {});
    } catch (err) {
      console.error('Error loading document:', err);
      setError('שגיאה בטעינת המסמך');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePartnership = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/influencer/partnerships/create-from-parsed',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            parsedData: editedData,
            documentId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create partnership');
      }

      const result = await response.json();
      router.push(
        `/influencer/${username}/partnerships/${result.partnership.id}`
      );
    } catch (err) {
      console.error('Error creating partnership:', err);
      setError('שגיאה ביצירת השת"פ');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            חזור
          </button>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  const confidence = document.parsing_confidence || 0;
  const confidenceColor =
    confidence >= 0.8
      ? 'text-green-600'
      : confidence >= 0.6
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">סקירת מסמך מנותח</h1>
        <p className="text-gray-600 mt-2">{document.filename}</p>
        <div className="flex items-center gap-4 mt-4">
          <span className="text-sm text-gray-500">
            מודל AI: {document.ai_model_used || 'N/A'}
          </span>
          <span className={`text-sm font-medium ${confidenceColor}`}>
            דיוק: {(confidence * 100).toFixed(0)}%
          </span>
          {document.download_url && (
            <a
              href={document.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              הורד מסמך מקורי
            </a>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {/* Parsing Status */}
      {document.parsing_status !== 'completed' && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            {document.parsing_status === 'pending' &&
              '⏳ המסמך ממתין לניתוח...'}
            {document.parsing_status === 'processing' &&
              '🔄 המסמך מנותח כעת...'}
            {document.parsing_status === 'failed' &&
              '❌ הניתוח נכשל. אנא מלא את הפרטים ידנית.'}
          </p>
        </div>
      )}

      {/* Parsed Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 text-right">
          פרטים שחולצו
        </h2>

        {document.parsing_status === 'completed' && editedData ? (
          <div className="space-y-6">
            {/* Brand Name */}
            {editedData.brandName !== undefined && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                  שם המותג
                </label>
                <input
                  type="text"
                  value={editedData.brandName || ''}
                  onChange={(e) =>
                    setEditedData({ ...editedData, brandName: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                />
              </div>
            )}

            {/* Campaign Name */}
            {editedData.campaignName !== undefined && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                  שם הקמפיין
                </label>
                <input
                  type="text"
                  value={editedData.campaignName || ''}
                  onChange={(e) =>
                    setEditedData({ ...editedData, campaignName: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                />
              </div>
            )}

            {/* Total Amount */}
            {editedData.totalAmount !== undefined && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                  סכום כולל (₪)
                </label>
                <input
                  type="number"
                  value={editedData.totalAmount || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      totalAmount: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                />
              </div>
            )}

            {/* Timeline */}
            {editedData.timeline && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                    תאריך התחלה
                  </label>
                  <input
                    type="date"
                    value={editedData.timeline.startDate || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData,
                        timeline: {
                          ...editedData.timeline,
                          startDate: e.target.value,
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                    תאריך סיום
                  </label>
                  <input
                    type="date"
                    value={editedData.timeline.endDate || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData,
                        timeline: {
                          ...editedData.timeline,
                          endDate: e.target.value,
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                  />
                </div>
              </div>
            )}

            {/* Deliverables */}
            {editedData.deliverables && editedData.deliverables.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
                  דליברבלס
                </label>
                <div className="space-y-2">
                  {editedData.deliverables.map((item: any, index: number) => (
                    <div
                      key={index}
                      className="p-3 border border-gray-200 rounded-lg text-right"
                    >
                      <p className="text-sm">
                        <span className="font-medium">{item.quantity}x</span>{' '}
                        {item.type} - {item.platform}
                      </p>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON (for debugging) */}
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                הצג JSON מלא
              </summary>
              <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-xs overflow-auto max-h-64 text-left">
                {JSON.stringify(editedData, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            אין נתונים לתצוגה. אנא מלא את הפרטים ידנית.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
        <button
          onClick={handleCreatePartnership}
          disabled={isSaving || !editedData.brandName}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'יוצר שת"פ...' : 'צור שת"פ מהמסמך'}
        </button>
      </div>
    </div>
  );
}
