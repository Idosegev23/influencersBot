'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BriefView } from '@/components/documents/BriefView';
import { QuoteView } from '@/components/documents/QuoteView';

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
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);

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

  const handleCreateTasks = async () => {
    setIsCreatingTasks(true);
    setError(null);

    try {
      // Create tasks from brief
      const tasks = editedData.tasks || [];

      if (tasks.length === 0) {
        setError('אין משימות בבריף');
        setIsCreatingTasks(false);
        return;
      }

      const createdTasks = [];
      for (const task of tasks) {
        const response = await fetch('/api/influencer/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            description: task.description || '',
            due_date: task.dueDate || null,
            priority: task.priority || 'medium',
            status: 'pending',
            type: 'brief_task',
          }),
        });

        if (response.ok) {
          const result = await response.json();
          createdTasks.push(result);
        }
      }

      setShowTasksModal(false);
      // Show success and redirect
      router.push(`/influencer/${username}/tasks`);
    } catch (err) {
      console.error('Error creating tasks:', err);
      setError('שגיאה ביצירת המשימות');
    } finally {
      setIsCreatingTasks(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className="max-w-6xl mx-auto py-8 px-4 animate-slide-up"
        style={{ background: 'transparent', color: 'var(--dash-text)' }}
      >
        <div className="animate-pulse space-y-4 animate-slide-up">
          <div className="h-8 rounded w-1/4 animate-slide-up" style={{ background: 'rgba(255,255,255,0.03)' }} />
          <div className="h-64 rounded animate-slide-up" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div
        className="max-w-6xl mx-auto py-8 px-4 animate-slide-up"
        style={{ background: 'transparent', color: 'var(--dash-text)' }}
      >
        <div
          className="rounded-xl p-6 text-center animate-slide-up"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-negative)' }}
        >
          <p style={{ color: 'var(--dash-negative)' }}>{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 rounded-xl animate-slide-up"
            style={{ background: 'var(--dash-negative)', color: 'white' }}
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
      ? 'var(--dash-positive)'
      : confidence >= 0.6
      ? 'var(--color-warning)'
      : 'var(--dash-negative)';

  return (
    <div
      className="max-w-6xl mx-auto py-8 px-4 animate-slide-up"
      style={{ background: 'transparent', color: 'var(--dash-text)' }}
    >
      {/* Back Button */}
      <div className="mb-6 animate-slide-up">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 transition-colors animate-slide-up"
          style={{ color: 'var(--dash-text-2)' }}
        >
          <svg className="w-5 h-5 animate-slide-up" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold animate-slide-up" style={{ color: 'var(--dash-text)' }}>סקירת מסמך מנותח</h1>
        <p className="mt-2 animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>{document.filename}</p>
        <div className="flex items-center gap-4 mt-4 animate-slide-up">
          <span className="text-sm animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>
            מודל AI: {document.ai_model_used || 'N/A'}
          </span>
          <span className="text-sm font-medium animate-slide-up" style={{ color: confidenceColor }}>
            דיוק: {(confidence * 100).toFixed(0)}%
          </span>
          {document.download_url && (
            <a
              href={document.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm animate-slide-up"
              style={{ color: 'var(--color-info)' }}
            >
              הורד מסמך מקורי
            </a>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          className="mb-6 rounded-xl p-4 animate-slide-up"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-negative)', color: 'var(--dash-negative)' }}
        >
          {error}
        </div>
      )}

      {/* Parsing Status */}
      {document.parsing_status !== 'completed' && (
        <div
          className="mb-6 rounded-xl p-4 animate-slide-up"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-warning)', color: 'var(--color-warning)' }}
        >
          <p>
            {document.parsing_status === 'pending' &&
              'המסמך ממתין לניתוח...'}
            {document.parsing_status === 'processing' &&
              'המסמך מנותח כעת...'}
            {document.parsing_status === 'failed' &&
              'הניתוח נכשל. אנא מלא את הפרטים ידנית.'}
          </p>
        </div>
      )}

      {/* Parsed Data */}
      <div
        className="rounded-xl border p-6 mb-6 animate-slide-up"
        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
      >
        {document.parsing_status === 'completed' && editedData ? (
          <>
            {/* Brief View - Special Display */}
            {document.document_type === 'brief' ? (
              <>
                <h2 className="text-xl font-semibold mb-6 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>
                  סקירת בריף
                </h2>
                <BriefView data={editedData} />
              </>
            ) : document.document_type === 'contract' ? (
              <>
                {/* Contract Review Display - Like partnerships/new */}
                <div className="mb-6 animate-slide-up">
                  <div className="flex items-center gap-3 mb-4 animate-slide-up">
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center animate-slide-up"
                      style={{ background: 'rgba(34,197,94,0.15)' }}
                    >
                      <svg className="h-6 w-6 animate-slide-up" style={{ color: 'var(--dash-positive)' }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold animate-slide-up" style={{ color: 'var(--dash-text)' }}>החוזה נותח בהצלחה!</h3>
                      <p className="text-sm animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>המערכת זיהתה את הפרטים הבאים:</p>
                    </div>
                  </div>

                  {/* Extracted Data Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 animate-slide-up">
                    {/* Brand */}
                    <div className="rounded-xl p-4 animate-slide-up" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <p className="text-xs font-medium mb-1 animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>מותג</p>
                      <p className="text-lg font-bold animate-slide-up" style={{ color: 'var(--color-info)' }}>{editedData.parties?.brand || editedData.brandName || '—'}</p>
                    </div>

                    {/* Amount */}
                    <div className="rounded-xl p-4 animate-slide-up" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <p className="text-xs font-medium mb-1 animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>סכום</p>
                      <p className="text-lg font-bold animate-slide-up" style={{ color: 'var(--dash-positive)' }}>
                        {editedData.paymentTerms?.totalAmount || editedData.totalAmount
                          ? `₪${(editedData.paymentTerms?.totalAmount || editedData.totalAmount).toLocaleString()}`
                          : '—'}
                      </p>
                    </div>

                    {/* Dates */}
                    <div className="rounded-xl p-4 animate-slide-up" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <p className="text-xs font-medium mb-1 animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>תאריכים</p>
                      <p className="text-sm font-bold animate-slide-up" style={{ color: 'var(--color-primary)' }}>
                        {editedData.effectiveDate || editedData.timeline?.startDate || '—'} → {editedData.expiryDate || editedData.timeline?.endDate || '—'}
                      </p>
                    </div>

                    {/* Deliverables */}
                    <div className="rounded-xl p-4 animate-slide-up" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <p className="text-xs font-medium mb-1 animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>דליברבלס</p>
                      <p className="text-lg font-bold animate-slide-up" style={{ color: 'var(--color-warning)' }}>
                        {editedData.deliverables?.length || 0} פריטים
                      </p>
                    </div>
                  </div>

                  {/* Payment Schedule */}
                  {editedData.paymentTerms?.schedule?.length > 0 && (
                    <div className="mb-6 animate-slide-up">
                      <p className="text-sm font-medium mb-3 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>מועדי תשלום שזוהו:</p>
                      <div className="space-y-2 animate-slide-up">
                        {editedData.paymentTerms.schedule.map((payment: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-xl p-3 animate-slide-up"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                          >
                            <div className="text-right flex-1 animate-slide-up">
                              <p className="font-bold animate-slide-up" style={{ color: 'var(--dash-positive)' }}>
                                ₪{payment.amount?.toLocaleString()} ({payment.percentage}%)
                              </p>
                              <p className="text-xs animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>{payment.trigger}</p>
                            </div>
                            {payment.dueDate && (
                              <span className="text-sm font-medium animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                                {new Date(payment.dueDate).toLocaleDateString('he-IL')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deliverables Details */}
                  {editedData.deliverables?.length > 0 && (
                    <div className="mb-6 animate-slide-up">
                      <p className="text-sm font-medium mb-3 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>דליברבלס שזוהו:</p>
                      <ul className="space-y-2 animate-slide-up">
                        {editedData.deliverables.map((d: any, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm rounded-xl p-3 animate-slide-up"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                          >
                            <span className="font-bold animate-slide-up" style={{ color: 'var(--color-info)' }}>{i + 1}.</span>
                            <span className="flex-1 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                              {d.quantity && <strong>{d.quantity}x </strong>}
                              {d.type && <span className="font-medium animate-slide-up">{d.type}</span>}
                              {d.description && <> - {d.description}</>}
                              {d.platform && <span className="text-xs animate-slide-up" style={{ color: 'var(--dash-text-3)' }}> ({d.platform})</span>}
                              {d.dueDate && (
                                <span className="block text-xs mt-1 animate-slide-up" style={{ color: 'var(--color-info)' }}>
                                  {new Date(d.dueDate).toLocaleDateString('he-IL')}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Important Terms Preview */}
                  <div className="mb-6 animate-slide-up">
                    <p className="text-sm font-medium mb-3 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>תנאים חשובים:</p>
                    <div className="space-y-2 animate-slide-up">
                      {editedData.exclusivity?.isExclusive && (
                        <div
                          className="rounded-xl p-3 text-right animate-slide-up"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                        >
                          <p className="text-sm font-bold animate-slide-up" style={{ color: 'var(--color-primary)' }}>חוזה אקסקלוסיבי</p>
                          {editedData.exclusivity.categories?.length > 0 && (
                            <p className="text-xs mt-1 animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                              {editedData.exclusivity.categories.join(', ')}
                            </p>
                          )}
                        </div>
                      )}

                      {editedData.terminationClauses?.[0] && (
                        <div
                          className="rounded-xl p-3 text-right animate-slide-up"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                        >
                          <p className="text-xs animate-slide-up" style={{ color: 'var(--color-warning)' }}>{editedData.terminationClauses[0]}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : document.document_type === 'quote' ? (
              <>
                <h2 className="text-xl font-semibold mb-6 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>
                  סקירת הצעת מחיר
                </h2>
                <QuoteView data={editedData} />
              </>
            ) : (
              <div className="space-y-6 animate-slide-up">
            {/* Brand Name */}
            {editedData.brandName !== undefined && (
              <div>
                <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                  שם המותג
                </label>
                <input
                  type="text"
                  value={editedData.brandName || ''}
                  onChange={(e) =>
                    setEditedData({ ...editedData, brandName: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-xl text-right animate-slide-up"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
                />
              </div>
            )}

            {/* Campaign Name */}
            {editedData.campaignName !== undefined && (
              <div>
                <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                  שם הקמפיין
                </label>
                <input
                  type="text"
                  value={editedData.campaignName || ''}
                  onChange={(e) =>
                    setEditedData({ ...editedData, campaignName: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-xl text-right animate-slide-up"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
                />
              </div>
            )}

            {/* Total Amount */}
            {editedData.totalAmount !== undefined && (
              <div>
                <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
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
                  className="w-full px-4 py-2 rounded-xl text-right animate-slide-up"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
                />
              </div>
            )}

            {/* Timeline */}
            {editedData.timeline && (
              <div className="grid grid-cols-2 gap-4 animate-slide-up">
                <div>
                  <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
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
                    className="w-full px-4 py-2 rounded-xl text-right animate-slide-up"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
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
                    className="w-full px-4 py-2 rounded-xl text-right animate-slide-up"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid var(--dash-glass-border)' }}
                  />
                </div>
              </div>
            )}

            {/* Deliverables */}
            {editedData.deliverables && editedData.deliverables.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                  דליברבלס
                </label>
                <div className="space-y-2 animate-slide-up">
                  {editedData.deliverables.map((item: any, index: number) => (
                    <div
                      key={index}
                      className="p-3 rounded-xl text-right animate-slide-up"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                    >
                      <p className="text-sm animate-slide-up">
                        <span className="font-medium animate-slide-up">{item.quantity}x</span>{' '}
                        {item.type} - {item.platform}
                      </p>
                      {item.description && (
                        <p className="text-sm mt-1 animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON (for debugging) */}
            <details className="mt-6 animate-slide-up">
              <summary className="cursor-pointer text-sm animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>
                הצג JSON מלא
              </summary>
              <pre
                className="mt-2 p-4 rounded-xl text-xs overflow-auto max-h-64 text-left animate-slide-up"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-2)' }}
              >
                {JSON.stringify(editedData, null, 2)}
              </pre>
            </details>
              </div>
            )}

            {/* Raw JSON always available */}
            {document.document_type === 'brief' && (
              <details className="mt-6 animate-slide-up">
                <summary className="cursor-pointer text-sm animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>
                  הצג JSON מלא
                </summary>
                <pre
                  className="mt-2 p-4 rounded-xl text-xs overflow-auto max-h-64 text-left animate-slide-up"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-2)' }}
                >
                  {JSON.stringify(editedData, null, 2)}
                </pre>
              </details>
            )}
          </>
        ) : (
          <p className="text-center py-8 animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>
            אין נתונים לתצוגה. אנא מלא את הפרטים ידנית.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end animate-slide-up">
        <button
          onClick={() => router.back()}
          className="px-6 py-2 rounded-xl transition-colors animate-slide-up"
          style={{ border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-2)' }}
        >
          חזור
        </button>

        {/* Different actions based on document type */}
        {document.document_type === 'brief' ? (
          <button
            onClick={() => setShowTasksModal(true)}
            disabled={!editedData.tasks || editedData.tasks.length === 0}
            className="btn-teal px-6 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed animate-slide-up"
          >
            צור {editedData.tasks?.length || 0} משימות מהבריף
          </button>
        ) : document.document_type === 'contract' ? (
          <div className="flex gap-3 animate-slide-up">
            <button
              onClick={handleCreatePartnership}
              disabled={isSaving || !editedData.parties?.brand}
              className="btn-primary px-6 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed animate-slide-up"
            >
              {isSaving ? 'יוצר שת"פ...' : 'צור שת"פ מההסכם'}
            </button>
            {editedData.tasks && editedData.tasks.length > 0 && (
              <button
                onClick={() => setShowTasksModal(true)}
                className="btn-teal px-6 py-2 rounded-xl transition-colors animate-slide-up"
              >
                צור {editedData.tasks?.length || 0} משימות מההסכם
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={handleCreatePartnership}
            disabled={isSaving || !editedData.brandName}
            className="btn-primary px-6 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed animate-slide-up"
          >
            {isSaving ? 'יוצר שת"פ...' : 'צור שת"פ מהמסמך'}
          </button>
        )}
      </div>

      {/* Tasks Confirmation Modal */}
      {showTasksModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-slide-up">
          <div
            className="rounded-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto animate-slide-up"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}
          >
            <h3 className="text-2xl font-bold mb-4 text-right animate-slide-up" style={{ color: 'var(--dash-text)' }}>
              אישור יצירת משימות
            </h3>

            <p className="mb-6 text-right animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>
              האם ליצור {editedData.tasks?.length || 0} משימות מה{document.document_type === 'brief' ? 'בריף' : 'הסכם'}?
            </p>

            {/* Tasks Preview */}
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto animate-slide-up">
              {editedData.tasks?.map((task: any, i: number) => (
                <div
                  key={i}
                  className="rounded-xl p-4 text-right animate-slide-up"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-glass-border)' }}
                >
                  <div className="flex items-start justify-between mb-2 animate-slide-up">
                    <h4 className="font-semibold animate-slide-up" style={{ color: 'var(--dash-text)' }}>{task.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      task.priority === 'high' ? 'bg-red-100 text-red-800' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {task.priority === 'high' ? 'גבוה' :
                       task.priority === 'medium' ? 'בינוני' : 'נמוך'}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-sm mb-2 animate-slide-up" style={{ color: 'var(--dash-text-2)' }}>{task.description}</p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs animate-slide-up" style={{ color: 'var(--dash-text-3)' }}>
                      {new Date(task.dueDate).toLocaleDateString('he-IL')}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end animate-slide-up">
              <button
                onClick={() => setShowTasksModal(false)}
                disabled={isCreatingTasks}
                className="px-6 py-2 rounded-xl transition-colors disabled:opacity-50 animate-slide-up"
                style={{ border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-2)' }}
              >
                ביטול
              </button>
              <button
                onClick={handleCreateTasks}
                disabled={isCreatingTasks}
                className="btn-teal px-6 py-2 rounded-xl transition-colors disabled:opacity-50 animate-slide-up"
              >
                {isCreatingTasks ? 'יוצר משימות...' : `אשר ויצור ${editedData.tasks?.length || 0} משימות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
