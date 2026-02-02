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
      // Get account ID from influencer
      const accountResponse = await fetch(`/api/influencer/${username}`);
      if (!accountResponse.ok) throw new Error('Failed to get account');
      const { influencer } = await accountResponse.json();
      const accountId = influencer.id;

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
            username,
            accountId,
            title: task.title,
            description: task.description || '',
            dueDate: task.dueDate || null,
            priority: task.priority || 'medium',
            status: 'pending',
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
        {document.parsing_status === 'completed' && editedData ? (
          <>
            {/* Brief View - Special Display */}
            {document.document_type === 'brief' ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6 text-right">
                  סקירת בריף
                </h2>
                <BriefView data={editedData} />
              </>
            ) : document.document_type === 'contract' ? (
              <>
                {/* Contract Review Display - Like partnerships/new */}
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">✅ החוזה נותח בהצלחה!</h3>
                      <p className="text-sm text-gray-600">המערכת זיהתה את הפרטים הבאים:</p>
                    </div>
                  </div>

                  {/* Extracted Data Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Brand */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-blue-900 mb-1">מותג</p>
                      <p className="text-lg font-bold text-blue-700">{editedData.parties?.brand || editedData.brandName || '—'}</p>
                    </div>

                    {/* Amount */}
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-green-900 mb-1">סכום</p>
                      <p className="text-lg font-bold text-green-700">
                        {editedData.paymentTerms?.totalAmount || editedData.totalAmount
                          ? `₪${(editedData.paymentTerms?.totalAmount || editedData.totalAmount).toLocaleString()}`
                          : '—'}
                      </p>
                    </div>

                    {/* Dates */}
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-purple-900 mb-1">תאריכים</p>
                      <p className="text-sm font-bold text-purple-700">
                        {editedData.effectiveDate || editedData.timeline?.startDate || '—'} → {editedData.expiryDate || editedData.timeline?.endDate || '—'}
                      </p>
                    </div>

                    {/* Deliverables */}
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-orange-900 mb-1">דליברבלס</p>
                      <p className="text-lg font-bold text-orange-700">
                        {editedData.deliverables?.length || 0} פריטים
                      </p>
                    </div>
                  </div>

                  {/* Payment Schedule */}
                  {editedData.paymentTerms?.schedule?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-gray-700 mb-3 text-right">💰 מועדי תשלום שזוהו:</p>
                      <div className="space-y-2">
                        {editedData.paymentTerms.schedule.map((payment: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="text-right flex-1">
                              <p className="font-bold text-green-900">
                                ₪{payment.amount?.toLocaleString()} ({payment.percentage}%)
                              </p>
                              <p className="text-xs text-green-700">{payment.trigger}</p>
                            </div>
                            {payment.dueDate && (
                              <span className="text-sm font-medium text-green-700">
                                📅 {new Date(payment.dueDate).toLocaleDateString('he-IL')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deliverables Details */}
                  {editedData.deliverables?.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-gray-700 mb-3 text-right">📋 דליברבלס שזוהו:</p>
                      <ul className="space-y-2">
                        {editedData.deliverables.map((d: any, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <span className="font-bold text-blue-600">{i + 1}.</span>
                            <span className="flex-1 text-right">
                              {d.quantity && <strong>{d.quantity}x </strong>}
                              {d.type && <span className="font-medium">{d.type}</span>}
                              {d.description && <> - {d.description}</>}
                              {d.platform && <span className="text-xs text-gray-500"> ({d.platform})</span>}
                              {d.dueDate && (
                                <span className="block text-xs text-blue-600 mt-1">
                                  📅 {new Date(d.dueDate).toLocaleDateString('he-IL')}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Important Terms Preview */}
                  <div className="mb-6">
                    <p className="text-sm font-medium text-gray-700 mb-3 text-right">⚖️ תנאים חשובים:</p>
                    <div className="space-y-2">
                      {editedData.exclusivity?.isExclusive && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-right">
                          <p className="text-sm font-bold text-purple-900">🔒 חוזה אקסקלוסיבי</p>
                          {editedData.exclusivity.categories?.length > 0 && (
                            <p className="text-xs text-purple-700 mt-1">
                              {editedData.exclusivity.categories.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {editedData.terminationClauses?.[0] && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-right">
                          <p className="text-xs text-orange-700">{editedData.terminationClauses[0]}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : document.document_type === 'quote' ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-6 text-right">
                  סקירת הצעת מחיר
                </h2>
                <QuoteView data={editedData} />
              </>
            ) : (
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
            )}

            {/* Raw JSON always available */}
            {document.document_type === 'brief' && (
              <details className="mt-6">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                  הצג JSON מלא
                </summary>
                <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-xs overflow-auto max-h-64 text-left">
                  {JSON.stringify(editedData, null, 2)}
                </pre>
              </details>
            )}
          </>
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
          חזור
        </button>
        
        {/* Different actions based on document type */}
        {document.document_type === 'brief' ? (
          <button
            onClick={() => setShowTasksModal(true)}
            disabled={!editedData.tasks || editedData.tasks.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            צור {editedData.tasks?.length || 0} משימות מהבריף
          </button>
        ) : (
          <button
            onClick={handleCreatePartnership}
            disabled={isSaving || !editedData.brandName}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'יוצר שת"פ...' : 'צור שת"פ מהמסמך'}
          </button>
        )}
      </div>

      {/* Tasks Confirmation Modal */}
      {showTasksModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-4 text-right">
              אישור יצירת משימות
            </h3>
            
            <p className="text-gray-600 mb-6 text-right">
              האם ליצור {editedData.tasks?.length || 0} משימות מהבריף?
            </p>

            {/* Tasks Preview */}
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {editedData.tasks?.map((task: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded-lg p-4 text-right border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{task.title}</h4>
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
                    <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs text-gray-500">
                      📅 {new Date(task.dueDate).toLocaleDateString('he-IL')}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowTasksModal(false)}
                disabled={isCreatingTasks}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateTasks}
                disabled={isCreatingTasks}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
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
