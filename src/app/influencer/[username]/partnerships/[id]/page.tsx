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
  const [activeTab, setActiveTab] = useState<'details' | 'payments' | 'deliverables' | 'terms' | 'documents' | 'coupons'>('details');

  // Document upload state
  const [selectedDocumentType, setSelectedDocumentType] = useState<'contract' | 'quote' | 'brief' | 'invoice' | 'receipt' | 'other'>('contract');

  // Coupons state
  const [coupons, setCoupons] = useState<any[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [isCreatingCoupon, setIsCreatingCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 0,
    min_purchase_amount: null as number | null,
    max_discount_amount: null as number | null,
    usage_limit: null as number | null,
    start_date: '',
    end_date: '',
    tracking_url: '',
  });

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

  const loadCoupons = async () => {
    setIsLoadingCoupons(true);
    try {
      console.log('🎟️ Loading coupons for partnership:', partnershipId);
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}/coupons?username=${username}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Failed to load coupons:', response.status, errorData);
        throw new Error('Failed to load coupons');
      }

      const result = await response.json();
      console.log('✅ Loaded coupons:', result.coupons);
      console.log('📊 Coupons count:', result.coupons?.length || 0);
      setCoupons(result.coupons || []);
    } catch (err) {
      console.error('Error loading coupons:', err);
      setCoupons([]);
    } finally {
      setIsLoadingCoupons(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCoupon(true);

    try {
      const response = await fetch(
        `/api/influencer/partnerships/${partnershipId}/coupons?username=${username}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCoupon),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create coupon');
      }

      const result = await response.json();
      console.log('✅ Coupon created:', result.coupon);

      // Reset form and reload coupons
      setNewCoupon({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: 0,
        min_purchase_amount: null,
        max_discount_amount: null,
        usage_limit: null,
        start_date: '',
        end_date: '',
        tracking_url: '',
      });
      setShowCouponForm(false);

      console.log('🔄 Reloading coupons after creation...');
      await loadCoupons();

      alert('הקופון נוצר בהצלחה!');
    } catch (err) {
      console.error('Error creating coupon:', err);
      alert('שגיאה ביצירת הקופון');
    } finally {
      setIsCreatingCoupon(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('הועתק ללוח!');
    } catch (err) {
      console.error('Failed to copy:', err);
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

    const uploadedDocumentIds: string[] = [];

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
            documentType: selectedDocumentType,
          }),
        });

        if (!metadataResponse.ok) {
          const error = await metadataResponse.json();
          console.error(`Failed to save metadata for ${file.name}:`, error);
          setError(`שמירת ${file.name} נכשלה`);
          continue;
        }

        const metadataResult = await metadataResponse.json();
        uploadedDocumentIds.push(metadataResult.document.id);

        console.log(`✓ Uploaded ${file.name}`);
      }

      // 3. Auto-parse uploaded documents
      if (uploadedDocumentIds.length > 0) {
        console.log(`📄 מנתח ${uploadedDocumentIds.length} מסמכים...`);

        try {
          const parseResponse = await fetch('/api/influencer/documents/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentIds: uploadedDocumentIds,
              documentType: selectedDocumentType,
            }),
          });

          if (parseResponse.ok) {
            console.log('✅ ניתוח הושלם בהצלחה');
          } else {
            const parseError = await parseResponse.json();
            console.warn('⚠️ ניתוח נכשל:', parseError.error);
            // Don't show error to user - document is uploaded, parsing is optional
          }
        } catch (parseErr) {
          console.warn('⚠️ שגיאה בניתוח:', parseErr);
          // Continue - document is uploaded
        }
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
      <div className="max-w-6xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-1/4" style={{ background: 'var(--dash-surface)' }} />
          <div className="h-64 rounded" style={{ background: 'var(--dash-surface)' }} />
        </div>
      </div>
    );
  }

  if (error && !partnership) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
        <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <p style={{ color: 'var(--dash-negative)' }}>{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 rounded-lg"
            style={{ background: 'var(--dash-negative)', color: '#fff' }}
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
    <div className="max-w-6xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.push(`/influencer/${username}/partnerships`)}
          className="flex items-center gap-2 transition-colors"
          style={{ color: 'var(--dash-text-2)' }}
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
          <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>{partnership.brand_name}</h1>
          {partnership.campaign_name && (
            <p className="mt-1" style={{ color: 'var(--dash-text-2)' }}>{partnership.campaign_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                ערוך
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--dash-negative)', color: '#fff' }}
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
                className="px-4 py-2 border rounded-lg"
                style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {isSaving ? 'שומר...' : 'שמור'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--dash-negative)', background: 'var(--dash-surface)', color: 'var(--dash-negative)' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b" style={{ borderColor: 'var(--dash-border)' }}>
        <div className="flex gap-6">
          {(['details', 'payments', 'deliverables', 'terms', 'documents', 'coupons'] as const).map((tab) => {
            const labels: Record<string, string> = {
              details: 'פרטי השת"פ',
              payments: 'מועדי תשלום',
              deliverables: 'משימות',
              terms: 'תנאים',
              documents: `מסמכים (${documents.length})`,
              coupons: `קופונים (${coupons.length})`,
            };
            return (
              <button
                key={tab}
                onClick={() => {
                  if (tab === 'coupons') loadCoupons();
                  setActiveTab(tab);
                }}
                className="pb-3 px-2 text-sm font-medium transition-colors border-b-2"
                style={{
                  borderColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--dash-text-3)',
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'details' && (
        <div className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
        {/* Status */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            סטטוס
          </label>
          {isEditing ? (
            <select
              value={editData.status || partnership.status}
              onChange={(e) => setEditData({ ...editData, status: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-right"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            >
              <option value="lead">Lead</option>
              <option value="negotiation">משא ומתן</option>
              <option value="active">פעיל</option>
              <option value="in_progress">בעבודה</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
            </select>
          ) : (
            <p style={{ color: 'var(--dash-text)' }}>{STATUS_LABELS[partnership.status] || partnership.status}</p>
          )}
        </div>

        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            שם הקמפיין
          </label>
          {isEditing ? (
            <input
              type="text"
              value={editData.campaign_name ?? partnership.campaign_name ?? ''}
              onChange={(e) => setEditData({ ...editData, campaign_name: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-right"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          ) : (
            <p style={{ color: 'var(--dash-text)' }}>{partnership.campaign_name || '—'}</p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
              תאריך התחלה
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editData.start_date ?? partnership.start_date ?? ''}
                onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg text-right"
                style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
              />
            ) : (
              <p style={{ color: 'var(--dash-text)' }}>
                {partnership.start_date
                  ? new Date(partnership.start_date).toLocaleDateString('he-IL')
                  : '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
              תאריך סיום
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editData.end_date ?? partnership.end_date ?? ''}
                onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg text-right"
                style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
              />
            ) : (
              <p style={{ color: 'var(--dash-text)' }}>
                {partnership.end_date
                  ? new Date(partnership.end_date).toLocaleDateString('he-IL')
                  : '—'}
              </p>
            )}
          </div>
        </div>

        {/* Contract Amount */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
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
              className="w-full px-4 py-2 border rounded-lg text-right"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          ) : (
            <p className="font-medium" style={{ color: 'var(--dash-text)' }}>
              {partnership.contract_amount
                ? `₪${partnership.contract_amount.toLocaleString('he-IL')}`
                : '—'}
            </p>
          )}
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            דליברבלס
          </label>
          {isEditing ? (
            <textarea
              value={
                typeof editData.deliverables === 'string'
                  ? editData.deliverables
                  : typeof partnership.deliverables === 'string'
                  ? partnership.deliverables
                  : Array.isArray(partnership.deliverables)
                  ? partnership.deliverables.map(d => `${d.quantity || ''}x ${d.type} - ${d.description}`).join('\n')
                  : ''
              }
              onChange={(e) => setEditData({ ...editData, deliverables: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border rounded-lg text-right"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          ) : (
            <div style={{ color: 'var(--dash-text)' }}>
              {typeof partnership.deliverables === 'string' ? (
                <p className="whitespace-pre-wrap">{partnership.deliverables}</p>
              ) : Array.isArray(partnership.deliverables) && partnership.deliverables.length > 0 ? (
                <div className="space-y-2">
                  {partnership.deliverables.map((d, i) => (
                    <div key={i} className="text-sm p-2 rounded" style={{ background: 'var(--dash-surface-hover)' }}>
                      {d.quantity && <strong>{d.quantity}x </strong>}
                      {d.type}
                      {d.description && <> - {d.description}</>}
                    </div>
                  ))}
                </div>
              ) : (
                <p>—</p>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            הערות
          </label>
          {isEditing ? (
            <textarea
              value={editData.notes ?? partnership.notes ?? ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border rounded-lg text-right"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          ) : (
            <p className="whitespace-pre-wrap" style={{ color: 'var(--dash-text)' }}>{partnership.notes || '—'}</p>
          )}
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t text-sm text-right" style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-3)' }}>
          <p>נוצר: {new Date(partnership.created_at).toLocaleString('he-IL')}</p>
          <p>עודכן: {new Date(partnership.updated_at).toLocaleString('he-IL')}</p>
        </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <h2 className="text-2xl font-bold mb-6 text-right" style={{ color: 'var(--dash-text)' }}>מועדי תשלום</h2>

          {partnership?.payment_schedule && partnership.payment_schedule.length > 0 ? (
            <div className="space-y-4">
              {/* Total Amount Summary */}
              <div className="rounded-xl border p-6 mb-6" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-positive)' }}>
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <p className="text-sm mb-1" style={{ color: 'var(--dash-positive)' }}>סכום כולל</p>
                    <p className="text-4xl font-bold" style={{ color: 'var(--dash-text)' }}>
                      ₪{partnership.contract_amount?.toLocaleString() || '—'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
                      {partnership.payment_schedule.length} תשלומים מתוכננים
                    </p>
                  </div>
                  <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-surface)' }}>
                    <svg className="h-8 w-8" style={{ color: 'var(--dash-positive)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Payment Timeline */}
              <div className="relative">
                {partnership.payment_schedule.map((milestone, index) => (
                  <div key={index} className="flex gap-4 mb-6 last:mb-0">
                    {/* Timeline Line */}
                    <div className="flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full border-2 flex items-center justify-center font-bold" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                        {index + 1}
                      </div>
                      {index < partnership.payment_schedule.length - 1 && (
                        <div className="w-0.5 h-full mt-2" style={{ minHeight: '60px', background: 'var(--dash-border)' }} />
                      )}
                    </div>

                    {/* Payment Card */}
                    <div className="flex-1 border-2 rounded-lg p-4 transition-colors" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-right flex-1">
                          <p className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>
                            ₪{milestone.amount.toLocaleString()}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>{milestone.percentage}% מהסכום</p>
                        </div>
                        {milestone.dueDate && (
                          <div className="px-3 py-1 rounded-full" style={{ background: 'var(--dash-surface-hover)' }}>
                            <p className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                              {new Date(milestone.dueDate).toLocaleDateString('he-IL')}
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-sm mb-3 text-right" style={{ color: 'var(--dash-text-2)' }}>
                        <strong>תנאי:</strong> {milestone.trigger}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            alert('הוספה ליומן - בקרוב!');
                          }}
                          className="px-4 py-2 text-sm rounded-lg transition-colors"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}
                        >
                          הוסף ליומן
                        </button>
                        <button
                          onClick={() => {
                            alert('תזכורת - בקרוב!');
                          }}
                          className="px-4 py-2 border text-sm rounded-lg transition-colors"
                          style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
                        >
                          תזכורת
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12" style={{ color: 'var(--dash-text-3)' }}>
              <svg className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--dash-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg mb-2">אין מועדי תשלום</p>
              <p className="text-sm">העלה חוזה עם פירוט תשלומים או הוסף ידנית</p>
            </div>
          )}
        </div>
      )}

      {/* Deliverables Tab */}
      {activeTab === 'deliverables' && (
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <h2 className="text-2xl font-bold mb-6 text-right" style={{ color: 'var(--dash-text)' }}>דליברבלס ומשימות</h2>

          {partnership?.deliverables && Array.isArray(partnership.deliverables) && partnership.deliverables.length > 0 ? (
            <div className="space-y-3">
              {partnership.deliverables.map((item, index) => {
                // Handle both string and object deliverables
                if (typeof item === 'string') {
                  return (
                    <div key={`del-${index}`} className="border-2 rounded-lg p-4" style={{ borderColor: 'var(--dash-border)' }}>
                      <p className="text-sm text-right" style={{ color: 'var(--dash-text-2)' }}>{item}</p>
                    </div>
                  );
                }

                return (
                <div key={`del-${index}-${item.type}`} className="border-2 rounded-lg p-4 transition-colors" style={{ borderColor: 'var(--dash-border)' }}>
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={item.completed || false}
                      onChange={() => {
                        alert('סימון השלמה - בקרוב!');
                      }}
                      className="mt-1 h-5 w-5 rounded"
                    />

                    <div className="flex-1 text-right">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>
                            {item.quantity && `${item.quantity}x `}
                            {item.type}
                          </h3>
                          <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>{item.description}</p>
                        </div>
                        {item.platform && (
                          <span className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--dash-surface-hover)', color: 'var(--color-info)' }}>
                            {item.platform}
                          </span>
                        )}
                      </div>

                      {item.dueDate && (
                        <p className="text-sm mb-3" style={{ color: 'var(--dash-text-3)' }}>
                          מועד: {new Date(item.dueDate).toLocaleDateString('he-IL')}
                        </p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            alert('יצירת משימה - בקרוב!');
                          }}
                          className="px-3 py-1.5 text-sm rounded transition-colors"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}
                        >
                          צור משימה
                        </button>
                        <button
                          onClick={() => {
                            alert('הוספה ליומן - בקרוב!');
                          }}
                          className="px-3 py-1.5 border text-sm rounded transition-colors"
                          style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
                        >
                          ליומן
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          ) : (
            <div className="text-center py-12" style={{ color: 'var(--dash-text-3)' }}>
              <svg className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--dash-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-lg mb-2">אין דליברבלס</p>
              <p className="text-sm">העלה חוזה או הוסף דליברבלס ידנית</p>
            </div>
          )}
        </div>
      )}

      {/* Terms Tab */}
      {activeTab === 'terms' && (
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <h2 className="text-2xl font-bold mb-6 text-right" style={{ color: 'var(--dash-text)' }}>תנאי החוזה</h2>

          <div className="space-y-6">
            {/* Scope */}
            {partnership?.contract_scope && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--color-primary)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-2 text-right" style={{ color: 'var(--dash-text)' }}>תחום החוזה</h3>
                <p className="text-sm text-right" style={{ color: 'var(--dash-text-2)' }}>{partnership.contract_scope}</p>
              </div>
            )}

            {/* Exclusivity */}
            {partnership?.exclusivity?.isExclusive && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--color-warning)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-2 text-right" style={{ color: 'var(--dash-text)' }}>אקסקלוסיביות</h3>
                <p className="text-sm mb-2 text-right font-medium" style={{ color: 'var(--color-warning)' }}>חוזה אקסקלוסיבי</p>
                {partnership.exclusivity.categories && partnership.exclusivity.categories.length > 0 && (
                  <ul className="text-sm space-y-1" style={{ color: 'var(--dash-text-2)' }}>
                    {partnership.exclusivity.categories.map((cat, i) => (
                      <li key={i} className="text-right">{cat}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Termination Clauses */}
            {partnership?.termination_clauses && partnership.termination_clauses.length > 0 && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--color-warning)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-3 text-right" style={{ color: 'var(--dash-text)' }}>תנאי ביטול</h3>
                <ul className="text-sm space-y-2" style={{ color: 'var(--dash-text-2)' }}>
                  {partnership.termination_clauses.map((clause, i) => (
                    <li key={i} className="text-right border-b pb-2 last:border-0" style={{ borderColor: 'var(--dash-border)' }}>{clause}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Liability Clauses */}
            {partnership?.liability_clauses && partnership.liability_clauses.length > 0 && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--dash-negative)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-3 text-right" style={{ color: 'var(--dash-text)' }}>אחריות ונזיקין</h3>
                <ul className="text-sm space-y-2" style={{ color: 'var(--dash-text-2)' }}>
                  {partnership.liability_clauses.map((clause, i) => (
                    <li key={i} className="text-right border-b pb-2 last:border-0" style={{ borderColor: 'var(--dash-border)' }}>{clause}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confidentiality */}
            {partnership?.confidentiality && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--dash-text-3)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-2 text-right" style={{ color: 'var(--dash-text)' }}>סודיות</h3>
                <p className="text-sm text-right" style={{ color: 'var(--dash-text-2)' }}>{partnership.confidentiality}</p>
              </div>
            )}

            {/* Auto Renewal */}
            {partnership?.auto_renewal && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--dash-positive)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-2 text-right" style={{ color: 'var(--dash-text)' }}>חידוש אוטומטי</h3>
                <p className="text-sm text-right" style={{ color: 'var(--dash-positive)' }}>החוזה מתחדש אוטומטית בתום התקופה</p>
              </div>
            )}

            {/* Key Dates */}
            {partnership?.key_dates && partnership.key_dates.length > 0 && (
              <div className="border-r-4 p-4 rounded-lg" style={{ borderColor: 'var(--color-info)', background: 'var(--dash-surface-hover)' }}>
                <h3 className="font-bold mb-3 text-right" style={{ color: 'var(--dash-text)' }}>תאריכים חשובים</h3>
                <ul className="text-sm space-y-2" style={{ color: 'var(--dash-text-2)' }}>
                  {partnership.key_dates.map((kd, i) => (
                    <li key={i} className="flex items-center justify-between text-right border-b pb-2 last:border-0" style={{ borderColor: 'var(--dash-border)' }}>
                      <span>{kd.event}</span>
                      <span className="font-medium" style={{ color: 'var(--color-info)' }}>
                        {new Date(kd.date).toLocaleDateString('he-IL')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Empty State */}
          {!partnership?.payment_schedule?.length &&
           !partnership?.exclusivity &&
           !partnership?.termination_clauses?.length &&
           !partnership?.liability_clauses?.length &&
           !partnership?.confidentiality && (
            <div className="text-center py-12" style={{ color: 'var(--dash-text-3)' }}>
              <svg className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--dash-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg mb-2">אין תנאי חוזה</p>
              <p className="text-sm">העלה חוזה עם תנאים מפורטים</p>
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          {/* Upload Section */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-6 text-right" style={{ color: 'var(--dash-text)' }}>
              העלאת מסמכים
            </h3>

            {/* Document Type Selector */}
            <div className="mb-6 rounded-lg p-4 border" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)' }}>
              <label className="block text-sm font-semibold mb-3 text-right" style={{ color: 'var(--dash-text)' }}>
                בחר סוג מסמך
              </label>
              <select
                value={selectedDocumentType}
                onChange={(e) => setSelectedDocumentType(e.target.value as any)}
                disabled={isUploading}
                className="w-full px-4 py-3 text-base border-2 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
              >
                <option value="contract">חוזה שת"פ</option>
                <option value="brief">בריף קמפיין</option>
                <option value="quote">הצעת מחיר</option>
                <option value="invoice">חשבונית</option>
                <option value="receipt">קבלה</option>
                <option value="other">אחר</option>
              </select>
              <p className="text-xs mt-2 text-right" style={{ color: 'var(--dash-text-3)' }}>
                {selectedDocumentType === 'contract' && 'הסכם שיתוף פעולה עם מותג'}
                {selectedDocumentType === 'brief' && 'דרישות תוכן והנחיות לקמפיין'}
                {selectedDocumentType === 'quote' && 'הצעה מסחרית או הצעת שת"פ'}
                {selectedDocumentType === 'invoice' && 'חשבונית או דרישת תשלום'}
                {selectedDocumentType === 'receipt' && 'אישור תשלום'}
                {selectedDocumentType === 'other' && 'AI ינחש את סוג המסמך אוטומטית'}
              </p>
            </div>

            {/* Upload Area */}
            <div className="rounded-lg p-8 border-2 border-dashed" style={{ borderColor: 'var(--color-primary)', background: 'var(--dash-surface-hover)' }}>
              <label className="flex flex-col items-center cursor-pointer group">
                <div className="mb-4 h-20 w-20 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-surface)' }}>
                  <svg className="w-10 h-10" style={{ color: 'var(--color-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <p className="text-lg font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>
                  {isUploading ? 'מעלה ומנתח...' : 'לחץ להעלאת קבצים או גרור לכאן'}
                </p>
                <p className="text-sm mb-4" style={{ color: 'var(--dash-text-2)' }}>
                  PDF, Word, תמונות - עד 10MB לקובץ
                </p>
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>{isUploading ? 'מעלה...' : 'בחר קבצים'}</span>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* AI Processing Info */}
            <div className="mt-4 rounded-xl border p-4" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--color-info)' }}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-surface)' }}>
                  <svg className="h-4 w-4" style={{ color: 'var(--color-info)' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-right flex-1">
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--dash-text)' }}>
                    ה-AI ינתח את המסמך אוטומטית
                  </p>
                  <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>
                    המערכת תחלץ: שמות, תאריכים, סכומים, דליברבלס, תנאים ועוד. התהליך לוקח 30 שניות - 8 דקות.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: 'var(--dash-border)' }}></div>

          {/* Documents List */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-right" style={{ color: 'var(--dash-text)' }}>
              מסמכים קיימים
            </h3>
            {documents.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--dash-text-3)' }}>
                <svg
                  className="w-16 h-16 mx-auto mb-4"
                  style={{ color: 'var(--dash-muted)' }}
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
                    className="flex items-center justify-between p-4 border rounded-lg transition-colors"
                    style={{ borderColor: 'var(--dash-border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {/* File Icon */}
                      <div className="flex-shrink-0">
                        <svg
                          className="w-10 h-10"
                          style={{ color: 'var(--color-primary)' }}
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
                        <div className="font-medium" style={{ color: 'var(--dash-text)' }}>{doc.file_name}</div>
                        <div className="text-sm flex items-center gap-2 justify-end mt-1" style={{ color: 'var(--dash-text-3)' }}>
                          <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                          <span>-</span>
                          <span>{doc.document_type}</span>
                          {doc.confidence_score && (
                            <>
                              <span>-</span>
                              <span style={{ color: 'var(--dash-positive)' }}>
                                AI: {(doc.confidence_score * 100).toFixed(0)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {doc.parsed_data && (doc as any).parsing_status === 'completed' && (
                        <button
                          onClick={() =>
                            router.push(
                              `/influencer/${username}/documents/${doc.id}/review`
                            )
                          }
                          className="text-sm"
                          style={{ color: 'var(--color-primary)' }}
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
                        className="text-sm"
                        style={{ color: 'var(--dash-text-2)' }}
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

      {/* Coupons Tab */}
      {activeTab === 'coupons' && (
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-right" style={{ color: 'var(--dash-text)' }}>קופונים ומעקב ROI</h2>
            <button
              onClick={() => setShowCouponForm(!showCouponForm)}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              {showCouponForm ? 'ביטול' : '+ קופון חדש'}
            </button>
          </div>

          {/* Create Coupon Form */}
          {showCouponForm && (
            <form onSubmit={handleCreateCoupon} className="mb-8 p-6 rounded-lg border" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)' }}>
              <h3 className="text-lg font-semibold mb-4 text-right" style={{ color: 'var(--dash-text)' }}>צור קופון חדש</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Coupon Code */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    קוד קופון *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCoupon.code}
                    onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER2026"
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* Discount Type */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    סוג הנחה *
                  </label>
                  <select
                    value={newCoupon.discount_type}
                    onChange={(e) => setNewCoupon({ ...newCoupon, discount_type: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  >
                    <option value="percentage">אחוז (%)</option>
                    <option value="fixed">סכום קבוע (₪)</option>
                    <option value="free_shipping">משלוח חינם</option>
                  </select>
                </div>

                {/* Discount Value */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    ערך ההנחה *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newCoupon.discount_value}
                    onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: parseFloat(e.target.value) })}
                    placeholder={newCoupon.discount_type === 'percentage' ? '10' : '50'}
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* Usage Limit */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    מגבלת שימושים
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCoupon.usage_limit || ''}
                    onChange={(e) => setNewCoupon({ ...newCoupon, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="100 (או השאר ריק ללא הגבלה)"
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    תאריך התחלה
                  </label>
                  <input
                    type="date"
                    value={newCoupon.start_date}
                    onChange={(e) => setNewCoupon({ ...newCoupon, start_date: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    תאריך סיום
                  </label>
                  <input
                    type="date"
                    value={newCoupon.end_date}
                    onChange={(e) => setNewCoupon({ ...newCoupon, end_date: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* Min Purchase */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    סכום קנייה מינימלי (₪)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCoupon.min_purchase_amount || ''}
                    onChange={(e) => setNewCoupon({ ...newCoupon, min_purchase_amount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0"
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>

                {/* Max Discount */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                    הנחה מקסימלית (₪)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCoupon.max_discount_amount || ''}
                    onChange={(e) => setNewCoupon({ ...newCoupon, max_discount_amount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="לא מוגבל"
                    className="w-full px-4 py-2 border rounded-lg text-right"
                    style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  תיאור
                </label>
                <textarea
                  value={newCoupon.description}
                  onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                  rows={2}
                  placeholder="קופון מיוחד למשפיעני Summer 2026"
                  className="w-full px-4 py-2 border rounded-lg text-right"
                  style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                />
              </div>

              {/* Tracking URL */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  URL מעקב (עם UTM)
                </label>
                <input
                  type="url"
                  value={newCoupon.tracking_url}
                  onChange={(e) => setNewCoupon({ ...newCoupon, tracking_url: e.target.value })}
                  placeholder="https://example.com?utm_source=instagram&utm_campaign=summer"
                  className="w-full px-4 py-2 border rounded-lg text-right"
                  style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                />
              </div>

              {/* Submit Button */}
              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={isCreatingCoupon}
                  className="flex-1 px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >
                  {isCreatingCoupon ? 'יוצר קופון...' : 'צור קופון'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCouponForm(false)}
                  className="px-6 py-3 rounded-lg"
                  style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)' }}
                >
                  ביטול
                </button>
              </div>
            </form>
          )}

          {/* Coupons List */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-right" style={{ color: 'var(--dash-text)' }}>
              קופונים קיימים
            </h3>

            {isLoadingCoupons ? (
              <div className="text-center py-12" style={{ background: 'var(--dash-bg)' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--color-primary)' }}></div>
                <p className="mt-4" style={{ color: 'var(--dash-text-3)' }}>טוען קופונים...</p>
              </div>
            ) : coupons.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--dash-text-3)' }}>
                <svg className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
                <p className="text-lg mb-2">אין קופונים עדיין</p>
                <p className="text-sm">צור קופון ראשון למעקב אחר ROI</p>
              </div>
            ) : (
              <div className="space-y-4">
                {coupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="border rounded-lg p-6 transition-shadow"
                    style={{ borderColor: 'var(--dash-border)' }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 text-right">
                        <div className="flex items-center gap-3 justify-end mb-2">
                          <h4 className="text-xl font-bold font-mono" style={{ color: 'var(--dash-text)' }}>
                            {coupon.code}
                          </h4>
                          {coupon.is_active ? (
                            <span className="px-2 py-1 text-xs rounded-full" style={{ background: 'var(--dash-surface-hover)', color: 'var(--dash-positive)' }}>
                              פעיל
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full" style={{ background: 'var(--dash-surface-hover)', color: 'var(--dash-text-3)' }}>
                              לא פעיל
                            </span>
                          )}
                        </div>
                        {coupon.description && (
                          <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>{coupon.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => copyToClipboard(coupon.code)}
                        className="px-4 py-2 rounded-lg transition-colors text-sm"
                        style={{ background: 'var(--color-primary)', color: '#fff' }}
                      >
                        העתק
                      </button>
                    </div>

                    {/* Coupon Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-right">
                        <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>הנחה</div>
                        <div className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>
                          {coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}%`
                            : coupon.discount_type === 'fixed'
                            ? `₪${coupon.discount_value}`
                            : 'משלוח חינם'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>שימושים</div>
                        <div className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>
                          {coupon.usage_count || 0}
                          {coupon.usage_limit && ` / ${coupon.usage_limit}`}
                        </div>
                      </div>
                      {coupon.start_date && (
                        <div className="text-right">
                          <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>תחילה</div>
                          <div className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                            {new Date(coupon.start_date).toLocaleDateString('he-IL')}
                          </div>
                        </div>
                      )}
                      {coupon.end_date && (
                        <div className="text-right">
                          <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>סיום</div>
                          <div className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                            {new Date(coupon.end_date).toLocaleDateString('he-IL')}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Info */}
                    {(coupon.min_purchase_amount || coupon.max_discount_amount) && (
                      <div className="text-sm space-y-1 text-right" style={{ color: 'var(--dash-text-2)' }}>
                        {coupon.min_purchase_amount && (
                          <div>קנייה מינימלית: ₪{coupon.min_purchase_amount}</div>
                        )}
                        {coupon.max_discount_amount && (
                          <div>הנחה מקסימלית: ₪{coupon.max_discount_amount}</div>
                        )}
                      </div>
                    )}

                    {/* Tracking URL */}
                    {coupon.tracking_url && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--dash-border)' }}>
                        <div className="text-sm mb-1 text-right" style={{ color: 'var(--dash-text-3)' }}>קישור מעקב:</div>
                        <a
                          href={coupon.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm truncate block text-right"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {coupon.tracking_url}
                        </a>
                      </div>
                    )}
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
