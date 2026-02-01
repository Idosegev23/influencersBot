'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';

interface PaymentMilestone {
  percentage: number;
  amount: number;
  trigger: string;
  dueDate: string | null;
}

interface Deliverable {
  type: string;
  quantity: number;
  platform: string;
  dueDate: string | null;
  description: string;
  completed?: boolean;
}

interface Partnership {
  id: string;
  brand_name: string;
  campaign_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_amount: number | null;
  deliverables: Deliverable[] | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Full parsed contract data
  payment_schedule?: PaymentMilestone[];
  exclusivity?: { isExclusive: boolean; categories: string[] } | null;
  termination_clauses?: string[];
  liability_clauses?: string[];
  confidentiality?: string | null;
  key_dates?: Array<{ event: string; date: string }>;
  contract_scope?: string | null;
  auto_renewal?: boolean;
  parsed_contract_data?: any;
}

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  document_type: string;
  uploaded_at: string;
  parsed_data: any;
  confidence_score: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  negotiation: 'משא ומתן',
  active: 'פעיל',
  in_progress: 'בעבודה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

export default function PartnershipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const partnershipId = params.id as string;

  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Partnership>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'payments' | 'deliverables' | 'terms' | 'documents'>('details');

  useEffect(() => {
    loadInfluencerAndData();
  }, [partnershipId]);

  const loadInfluencerAndData = async () => {
    try {
      // Get influencer first to get account_id
      const influencerRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=1`);
      if (influencerRes.ok) {
        const influencerData = await influencerRes.json();
        // For simplicity, we'll use a helper API or derive account_id
        // For now, let's just fetch the partnership which should have account_id
      }
    } catch (err) {
      console.error('Error loading influencer:', err);
    }
    
    await Promise.all([loadPartnership(), loadDocuments()]);
  };

  const loadPartnership = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load partnership');
      }

      const result = await response.json();
      setPartnership(result.partnership);
      setEditData(result.partnership);
      
      // Get account_id from partnership
      if (result.partnership.account_id) {
        setAccountId(result.partnership.account_id);
      }
    } catch (err) {
      console.error('Error loading partnership:', err);
      setError('שגיאה בטעינת השת"פ');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}/documents?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const result = await response.json();
      setDocuments(result.documents || []);
    } catch (err) {
      console.error('Error loading documents:', err);
      setDocuments([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!accountId) {
      setError('לא נמצא account ID');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Upload files directly to Supabase Storage (bypasses Vercel 4.5MB limit)
      for (const file of Array.from(files)) {
        // Check file size (max 10MB)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          setError(`${file.name} גדול מדי (${(file.size / 1024 / 1024).toFixed(2)}MB). מקסימום 10MB.`);
          continue;
        }

        // 1. Upload directly to Supabase Storage (client-side)
        const timestamp = Date.now();
        const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${accountId}/partnerships/${partnershipId}/${timestamp}_${cleanFilename}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('partnership-documents')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          setError(`העלאת ${file.name} נכשלה`);
          continue;
        }

        // 2. Save metadata to DB via lightweight API (only JSON, no file payload)
        const metadataResponse = await fetch('/api/influencer/documents/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            accountId,
            partnershipId,
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type,
            storagePath,
            documentType: 'contract',
          }),
        });

        if (!metadataResponse.ok) {
          const error = await metadataResponse.json();
          console.error(`Failed to save metadata for ${file.name}:`, error);
          setError(`שמירת ${file.name} נכשלה`);
          continue;
        }

        console.log(`✓ Uploaded ${file.name}`);
      }

      // Reload documents
      await loadDocuments();
      setError(null); // Clear any errors on success
    } catch (err) {
      console.error('Error uploading documents:', err);
      setError('שגיאה בהעלאת המסמכים');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/influencer/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...editData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update partnership');
      }

      const result = await response.json();
      setPartnership(result.partnership);
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating partnership:', err);
      setError('שגיאה בעדכון השת"פ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את השת"פ?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}?username=${username}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete partnership');
      }

      router.push(`/influencer/${username}/partnerships`);
    } catch (err) {
      console.error('Error deleting partnership:', err);
      setError('שגיאה במחיקת השת"פ');
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

  if (error && !partnership) {
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

  if (!partnership) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.push(`/influencer/${username}/partnerships`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור לשת"פים</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{partnership.brand_name}</h1>
          {partnership.campaign_name && (
            <p className="text-gray-600 mt-1">{partnership.campaign_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                ערוך
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                מחק
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditData(partnership);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'שומר...' : 'שמור'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'details'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            פרטי השת"פ
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            מסמכים ({documents.length})
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'details' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            סטטוס
          </label>
          {isEditing ? (
            <select
              value={editData.status || partnership.status}
              onChange={(e) => setEditData({ ...editData, status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            >
              <option value="lead">Lead</option>
              <option value="negotiation">משא ומתן</option>
              <option value="active">פעיל</option>
              <option value="in_progress">בעבודה</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
            </select>
          ) : (
            <p className="text-gray-900">{STATUS_LABELS[partnership.status] || partnership.status}</p>
          )}
        </div>

        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            שם הקמפיין
          </label>
          {isEditing ? (
            <input
              type="text"
              value={editData.campaign_name ?? partnership.campaign_name ?? ''}
              onChange={(e) => setEditData({ ...editData, campaign_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          ) : (
            <p className="text-gray-900">{partnership.campaign_name || '—'}</p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך התחלה
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editData.start_date ?? partnership.start_date ?? ''}
                onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
              />
            ) : (
              <p className="text-gray-900">
                {partnership.start_date
                  ? new Date(partnership.start_date).toLocaleDateString('he-IL')
                  : '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך סיום
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editData.end_date ?? partnership.end_date ?? ''}
                onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
              />
            ) : (
              <p className="text-gray-900">
                {partnership.end_date
                  ? new Date(partnership.end_date).toLocaleDateString('he-IL')
                  : '—'}
              </p>
            )}
          </div>
        </div>

        {/* Contract Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            סכום החוזה (₪)
          </label>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={editData.contract_amount ?? partnership.contract_amount ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, contract_amount: parseFloat(e.target.value) })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          ) : (
            <p className="text-gray-900 font-medium">
              {partnership.contract_amount
                ? `₪${partnership.contract_amount.toLocaleString('he-IL')}`
                : '—'}
            </p>
          )}
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            דליברבלס
          </label>
          {isEditing ? (
            <textarea
              value={editData.deliverables ?? partnership.deliverables ?? ''}
              onChange={(e) => setEditData({ ...editData, deliverables: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          ) : (
            <p className="text-gray-900 whitespace-pre-wrap">
              {partnership.deliverables || '—'}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            הערות
          </label>
          {isEditing ? (
            <textarea
              value={editData.notes ?? partnership.notes ?? ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
            />
          ) : (
            <p className="text-gray-900 whitespace-pre-wrap">{partnership.notes || '—'}</p>
          )}
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200 text-sm text-gray-500 text-right">
          <p>נוצר: {new Date(partnership.created_at).toLocaleString('he-IL')}</p>
          <p>עודכן: {new Date(partnership.updated_at).toLocaleString('he-IL')}</p>
        </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {/* Upload Section */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
              העלאת מסמכים
            </h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span>{isUploading ? 'מעלה...' : 'העלה מסמך'}</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-gray-500">
                PDF, Word, תמונות (עד 50MB)
              </p>
            </div>
            <p className="text-sm text-gray-600 mt-2 text-right">
              💡 ה-AI ינתח אוטומטית את המסמך ויחלץ פרטים רלוונטיים
            </p>
          </div>

          {/* Documents List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
              מסמכים קיימים
            </h3>
            {documents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
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
                <p className="text-lg mb-2">אין מסמכים עדיין</p>
                <p className="text-sm">העלה חוזים, הצעות מחיר או מסמכים אחרים</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {/* File Icon */}
                      <div className="flex-shrink-0">
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
                      </div>

                      {/* File Info */}
                      <div className="flex-1 text-right">
                        <div className="font-medium text-gray-900">{doc.file_name}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2 justify-end mt-1">
                          <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>{doc.document_type}</span>
                          {doc.confidence_score && (
                            <>
                              <span>•</span>
                              <span className="text-green-600">
                                AI: {(doc.confidence_score * 100).toFixed(0)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {doc.parsed_data && doc.parsing_status === 'completed' && (
                        <button
                          onClick={() =>
                            router.push(
                              `/influencer/${username}/documents/${doc.id}/review`
                            )
                          }
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          סקור נתונים
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const res = await fetch(
                            `/api/influencer/documents/${doc.id}?username=${username}`
                          );
                          const { document } = await res.json();
                          if (document.download_url) {
                            window.open(document.download_url, '_blank');
                          }
                        }}
                        className="text-sm text-gray-600 hover:text-gray-700"
                      >
                        הורד
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
