'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';

interface Partnership {
  id: string;
  account_id?: string;
  brand_name: string;
  campaign_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_amount: number | null;
  proposal_amount?: number | null;
  brief: string | null;
  deliverables: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
  coupon_code?: string | null;
  whatsapp_phone?: string | null;
  brand_contact_name?: string | null;
  brand_contact_email?: string | null;
  brand_contact_phone?: string | null;
  brand_logo_url?: string | null;
  category?: string | null;
  // Parsed contract data
  payment_schedule?: Array<{ percentage: number; amount: number; trigger: string; dueDate: string | null }>;
  exclusivity?: { isExclusive: boolean; categories: string[] } | null;
  termination_clauses?: string[];
  liability_clauses?: string[];
  confidentiality?: string | null;
  key_dates?: Array<{ event: string; date: string }>;
  contract_scope?: string | null;
  auto_renewal?: boolean;
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
  parsing_status?: string;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  lead: { label: 'ליד', bg: 'rgba(156,163,175,0.15)', text: 'var(--dash-text-2)', dot: '#9ca3af' },
  proposal: { label: 'הצעה', bg: 'rgba(168,85,247,0.15)', text: '#a855f7', dot: '#a855f7' },
  negotiation: { label: 'משא ומתן', bg: 'rgba(249,115,22,0.15)', text: '#f97316', dot: '#f97316' },
  contract: { label: 'חוזה', bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', dot: '#3b82f6' },
  active: { label: 'פעיל', bg: 'rgba(34,197,94,0.15)', text: '#22c55e', dot: '#22c55e' },
  in_progress: { label: 'בעבודה', bg: 'rgba(34,197,94,0.15)', text: '#22c55e', dot: '#22c55e' },
  completed: { label: 'הושלם', bg: 'rgba(16,185,129,0.15)', text: '#10b981', dot: '#10b981' },
  cancelled: { label: 'בוטל', bg: 'rgba(239,68,68,0.15)', text: '#ef4444', dot: '#ef4444' },
};

export default function PartnershipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const partnershipId = params.id as string;

  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Partnership>>({});
  const [selectedDocType, setSelectedDocType] = useState<string>('contract');
  const [showContractDetails, setShowContractDetails] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // ─── Data Loading ───

  useEffect(() => {
    loadAll();
  }, [partnershipId]);

  const loadAll = async () => {
    await Promise.all([loadPartnership(), loadDocuments()]);
  };

  const loadPartnership = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/influencer/partnerships/${partnershipId}?username=${username}`);
      if (!res.ok) throw new Error('Failed');
      const { partnership: p } = await res.json();
      setPartnership(p);
      setEditData(p);
      if (p.account_id) setAccountId(p.account_id);
    } catch {
      setError('שגיאה בטעינת השת"פ');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await fetch(`/api/influencer/partnerships/${partnershipId}/documents?username=${username}`);
      if (res.ok) {
        const { documents: docs } = await res.json();
        setDocuments(docs || []);
      }
    } catch { setDocuments([]); }
  };

  const loadCoupons = async () => {
    try {
      const res = await fetch(`/api/influencer/partnerships/${partnershipId}/coupons?username=${username}`);
      if (res.ok) {
        const { coupons: c } = await res.json();
        setCoupons(c || []);
      }
    } catch { setCoupons([]); }
  };

  useEffect(() => {
    if (partnership) loadCoupons();
  }, [partnership?.id]);

  // ─── Actions ───

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/influencer/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...editData }),
      });
      if (!res.ok) throw new Error('Failed');
      const { partnership: p } = await res.json();
      setPartnership(p);
      setIsEditing(false);
    } catch {
      setError('שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('למחוק את השת"פ?')) return;
    try {
      await fetch(`/api/influencer/partnerships/${partnershipId}?username=${username}`, { method: 'DELETE' });
      router.push(`/influencer/${username}/partnerships`);
    } catch {
      setError('שגיאה במחיקה');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !accountId) return;
    setIsUploading(true);
    setError(null);
    const uploadedIds: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) { setError(`${file.name} גדול מדי (מקס 10MB)`); continue; }

        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${accountId}/partnerships/${partnershipId}/${Date.now()}_${cleanName}`;

        const { error: upErr } = await supabaseClient.storage
          .from('partnership-documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) { setError(`העלאת ${file.name} נכשלה`); continue; }

        const metaRes = await fetch('/api/influencer/documents/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, accountId, partnershipId, filename: file.name, fileSize: file.size, mimeType: file.type, storagePath: path, documentType: selectedDocType }),
        });
        if (metaRes.ok) {
          const { document: doc } = await metaRes.json();
          uploadedIds.push(doc.id);
        }
      }

      if (uploadedIds.length > 0) {
        fetch('/api/influencer/documents/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds: uploadedIds, documentType: selectedDocType }),
        }).catch(() => {});
      }
      await loadDocuments();
      setError(null);
    } catch {
      setError('שגיאה בהעלאה');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('username', username);
      form.append('logo', file);
      const res = await fetch(`/api/influencer/partnerships/${partnershipId}/brand-logo`, { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setPartnership(prev => prev ? { ...prev, brand_logo_url: data.logo_url } : prev);
      } else {
        setError(data.error || 'שגיאה בהעלאת לוגו');
      }
    } catch {
      setError('שגיאה בהעלאת לוגו');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  // ─── Render helpers ───

  const hasContractDetails = partnership && (
    (partnership.payment_schedule?.length ?? 0) > 0 ||
    partnership.exclusivity?.isExclusive ||
    (partnership.termination_clauses?.length ?? 0) > 0 ||
    (partnership.liability_clauses?.length ?? 0) > 0 ||
    partnership.confidentiality ||
    (partnership.key_dates?.length ?? 0) > 0 ||
    partnership.contract_scope ||
    partnership.auto_renewal
  );

  // ─── Loading & Error states ───

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 animate-slide-up">
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-1/3" style={{ background: 'rgba(255,255,255,0.03)' }} />
          <div className="h-48 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    );
  }

  if (!partnership) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-center">
        <p style={{ color: 'var(--dash-negative)' }}>{error || 'לא נמצא'}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--dash-text-2)' }}>חזור</button>
      </div>
    );
  }

  const st = STATUS_MAP[partnership.status] || STATUS_MAP.lead;
  const amount = partnership.contract_amount || partnership.proposal_amount || 0;

  // ─── Main Render ───

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6" style={{ color: 'var(--dash-text)' }}>

      {/* Back */}
      <button
        onClick={() => router.push(`/influencer/${username}/partnerships`)}
        className="flex items-center gap-2 text-sm transition-colors"
        style={{ color: 'var(--dash-text-3)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        חזור לשת"פים
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ═══ Header Card ═══ */}
      <div className="glass-card rounded-2xl p-6"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {partnership.brand_logo_url ? (
              <img src={partnership.brand_logo_url} alt={partnership.brand_name} className="w-14 h-14 rounded-xl object-contain flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px' }} />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0" style={{ background: st.bg, color: st.text }}>
                {partnership.brand_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{partnership.brand_name}</h1>
              {partnership.campaign_name && (
                <p className="text-sm truncate" style={{ color: 'var(--dash-text-2)' }}>{partnership.campaign_name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: st.bg, color: st.text }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
              {st.label}
            </span>
          </div>
        </div>

        {/* Key metrics row */}
        <div className="flex flex-wrap gap-4 text-sm">
          {amount > 0 && (
            <div>
              <span style={{ color: 'var(--dash-text-3)' }}>סכום: </span>
              <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>₪{amount.toLocaleString('he-IL')}</span>
            </div>
          )}
          {partnership.start_date && (
            <div>
              <span style={{ color: 'var(--dash-text-3)' }}>התחלה: </span>
              <span>{new Date(partnership.start_date).toLocaleDateString('he-IL')}</span>
            </div>
          )}
          {partnership.end_date && (
            <div>
              <span style={{ color: 'var(--dash-text-3)' }}>סיום: </span>
              <span>{new Date(partnership.end_date).toLocaleDateString('he-IL')}</span>
            </div>
          )}
          {partnership.category && (
            <div>
              <span style={{ color: 'var(--dash-text-3)' }}>קטגוריה: </span>
              <span>{partnership.category}</span>
            </div>
          )}
        </div>

        {/* Contact info */}
        {(partnership.whatsapp_phone || partnership.brand_contact_email || partnership.brand_contact_name) && (
          <div className="flex flex-wrap gap-4 text-sm mt-2">
            {partnership.brand_contact_name && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                <span style={{ color: 'var(--dash-text-2)' }}>{partnership.brand_contact_name}</span>
              </div>
            )}
            {partnership.whatsapp_phone && (
              <a href={`https://wa.me/${partnership.whatsapp_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <svg className="w-3.5 h-3.5" style={{ color: '#25D366' }} fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>
                <span dir="ltr" style={{ color: 'var(--dash-text-2)' }}>{partnership.whatsapp_phone}</span>
              </a>
            )}
            {partnership.brand_contact_email && (
              <a href={`mailto:${partnership.brand_contact_email}`} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span dir="ltr" style={{ color: 'var(--dash-text-2)' }}>{partnership.brand_contact_email}</span>
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--dash-glass-border)' }}>
          {!isEditing ? (
            <>
              <button onClick={() => setIsEditing(true)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors btn-primary">
                ערוך
              </button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm transition-colors" style={{ color: 'var(--dash-text-3)' }}>
                מחק
              </button>
              <button
                onClick={() => router.push(`/influencer/${username}/partnerships/${partnershipId}/summary`)}
                className="px-4 py-2 rounded-xl text-sm transition-colors mr-auto btn-secondary"
              >
                סיכום AI
              </button>
            </>
          ) : (
            <>
              <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 btn-solid">
                {isSaving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={() => { setIsEditing(false); setEditData(partnership); }} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--dash-text-3)' }}>
                ביטול
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Edit Form (shown only when editing) ═══ */}
      {isEditing && (
        <div className="glass-card rounded-2xl p-5 space-y-5"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--dash-text-2)' }}>עריכת פרטים</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>סטטוס</label>
              <select value={editData.status || ''} onChange={e => setEditData({ ...editData, status: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-right" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>סכום (₪)</label>
              <input type="number" value={editData.contract_amount ?? ''} onChange={e => setEditData({ ...editData, contract_amount: parseFloat(e.target.value) || null })} className="w-full px-3 py-2 rounded-xl text-sm text-right" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>תאריך התחלה</label>
              <input type="date" value={editData.start_date ?? ''} onChange={e => setEditData({ ...editData, start_date: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>תאריך סיום</label>
              <input type="date" value={editData.end_date ?? ''} onChange={e => setEditData({ ...editData, end_date: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>שם קמפיין</label>
              <input type="text" value={editData.campaign_name ?? ''} onChange={e => setEditData({ ...editData, campaign_name: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-right" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
            </div>
          </div>

          {/* Brand Contact Info */}
          <div>
            <h4 className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--dash-text-3)' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              פרטי קשר מותג (פר שת"פ)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>שם איש קשר</label>
                <input type="text" value={editData.brand_contact_name ?? ''} onChange={e => setEditData({ ...editData, brand_contact_name: e.target.value })} placeholder="למשל: יוסי כהן" className="w-full px-3 py-2 rounded-xl text-sm text-right" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>וואטסאפ מותג</label>
                <input type="tel" dir="ltr" value={editData.whatsapp_phone ?? ''} onChange={e => setEditData({ ...editData, whatsapp_phone: e.target.value })} placeholder="972501234567" className="w-full px-3 py-2 rounded-xl text-sm text-left" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>מייל מותג</label>
                <input type="email" dir="ltr" value={editData.brand_contact_email ?? ''} onChange={e => setEditData({ ...editData, brand_contact_email: e.target.value })} placeholder="contact@brand.com" className="w-full px-3 py-2 rounded-xl text-sm text-left" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>טלפון מותג</label>
                <input type="tel" dir="ltr" value={editData.brand_contact_phone ?? ''} onChange={e => setEditData({ ...editData, brand_contact_phone: e.target.value })} placeholder="03-1234567" className="w-full px-3 py-2 rounded-xl text-sm text-left" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
              </div>
            </div>
          </div>

          {/* Brand Logo Upload (global) */}
          <div>
            <h4 className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--dash-text-3)' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              לוגו מותג (משותף לכל המשפיענים)
            </h4>
            <div className="flex items-center gap-4">
              {partnership.brand_logo_url ? (
                <img src={partnership.brand_logo_url} alt={partnership.brand_name} className="w-16 h-16 rounded-xl object-contain" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px' }} />
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: 'transparent', border: '1px dashed var(--dash-glass-border)' }}>
                  <svg className="w-6 h-6" style={{ color: 'var(--dash-text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              )}
              <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors btn-primary" style={{ opacity: isUploadingLogo ? 0.5 : 1 }}>
                {isUploadingLogo ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                )}
                {isUploadingLogo ? 'מעלה...' : partnership.brand_logo_url ? 'החלף לוגו' : 'העלה לוגו'}
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={isUploadingLogo} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-3)' }}>הערות</label>
            <textarea value={editData.notes ?? ''} onChange={e => setEditData({ ...editData, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-xl text-sm text-right" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)', color: 'var(--dash-text)' }} />
          </div>
        </div>
      )}

      {/* ═══ Brief / Notes ═══ */}
      {!isEditing && (partnership.brief || partnership.notes) && (
        <div className="glass-card rounded-2xl p-5"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
          {partnership.brief && (
            <div className="mb-3">
              <h3 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>בריף</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--dash-text)' }}>{partnership.brief}</p>
            </div>
          )}
          {partnership.notes && (
            <div>
              <h3 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>הערות</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--dash-text-2)' }}>{partnership.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Coupons (inline, compact) ═══ */}
      {coupons.length > 0 && (
        <div className="glass-card rounded-2xl p-5"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--dash-text-2)' }}>קופונים</h3>
          <div className="space-y-2">
            {coupons.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)' }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-primary)' }}>{c.code}</span>
                  <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                    {c.discount_type === 'percentage' ? `${c.discount_value}%` : c.discount_type === 'fixed' ? `₪${c.discount_value}` : 'משלוח חינם'}
                  </span>
                  {c.is_active ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{c.usage_count || 0} שימושים</span>
                  <button onClick={() => copyToClipboard(c.code)} className="px-2.5 py-1 rounded-xl text-xs transition-colors btn-primary">
                    העתק
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Deliverables (only if exist) ═══ */}
      {partnership.deliverables && (
        Array.isArray(partnership.deliverables) ? partnership.deliverables.length > 0 : typeof partnership.deliverables === 'string' && partnership.deliverables.trim()
      ) && (
        <div className="glass-card rounded-2xl p-5"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--dash-text-2)' }}>דליברבלס</h3>
          {typeof partnership.deliverables === 'string' ? (
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--dash-text)' }}>{partnership.deliverables}</p>
          ) : (
            <div className="space-y-2">
              {(partnership.deliverables as any[]).map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-sm" style={{ background: 'transparent' }}>
                  <input type="checkbox" checked={d.completed || false} readOnly className="rounded" />
                  <span style={{ color: 'var(--dash-text)' }}>
                    {d.quantity && <strong>{d.quantity}x </strong>}{d.type}{d.description && ` — ${d.description}`}
                  </span>
                  {d.platform && <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--dash-text-3)' }}>{d.platform}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Documents (compact) ═══ */}
      <div className="glass-card rounded-2xl p-5"  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-2)' }}>מסמכים ({documents.length})</h3>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors btn-primary">
            {isUploading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            )}
            {isUploading ? 'מעלה...' : 'העלה'}
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileUpload} disabled={isUploading} className="hidden" />
          </label>
        </div>

        {/* Doc type selector */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {[
            { v: 'contract', l: 'חוזה' },
            { v: 'brief', l: 'בריף' },
            { v: 'invoice', l: 'חשבונית' },
            { v: 'other', l: 'אחר' },
          ].map(t => (
            <button key={t.v} onClick={() => setSelectedDocType(t.v)} className={`px-2.5 py-1 rounded-xl text-[11px] transition-colors ${selectedDocType === t.v ? 'pill pill-purple' : 'pill pill-neutral'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {documents.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--dash-text-3)' }}>אין מסמכים. העלה חוזה, בריף או חשבונית.</p>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'transparent', border: '1px solid var(--dash-glass-border)' }}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--dash-text)' }}>{doc.file_name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--dash-text-3)' }}>
                      {doc.document_type} · {(doc.file_size / 1024 / 1024).toFixed(1)}MB
                      {doc.confidence_score && <span style={{ color: 'var(--dash-positive)' }}> · AI {(doc.confidence_score * 100).toFixed(0)}%</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {doc.parsing_status === 'completed' && (
                    <button onClick={() => router.push(`/influencer/${username}/documents/${doc.id}/review`)} className="text-xs" style={{ color: 'var(--color-primary)' }}>סקור</button>
                  )}
                  <button onClick={async () => {
                    const r = await fetch(`/api/influencer/documents/${doc.id}?username=${username}`);
                    const { document: d } = await r.json();
                    if (d?.download_url) window.open(d.download_url, '_blank');
                  }} className="text-xs" style={{ color: 'var(--dash-text-3)' }}>הורד</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Contract Details (collapsible, only if data exists) ═══ */}
      {hasContractDetails && (
        <div className="rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-glass-border)' }}>
          <button
            onClick={() => setShowContractDetails(!showContractDetails)}
            className="w-full flex items-center justify-between p-5 text-sm font-semibold"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <span>פרטי חוזה</span>
            <svg className={`w-4 h-4 transition-transform ${showContractDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showContractDetails && (
            <div className="px-5 pb-5 space-y-4">
              {/* Payment Schedule */}
              {partnership.payment_schedule && partnership.payment_schedule.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--dash-text-3)' }}>מועדי תשלום</h4>
                  <div className="space-y-2">
                    {partnership.payment_schedule.map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl text-sm" style={{ background: 'transparent' }}>
                        <div>
                          <span className="font-semibold">₪{m.amount.toLocaleString()}</span>
                          <span className="text-xs mr-2" style={{ color: 'var(--dash-text-3)' }}>({m.percentage}%)</span>
                        </div>
                        <div className="text-xs text-left" style={{ color: 'var(--dash-text-2)' }}>
                          {m.trigger}
                          {m.dueDate && <span className="mr-2" style={{ color: 'var(--dash-text-3)' }}>{new Date(m.dueDate).toLocaleDateString('he-IL')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contract Scope */}
              {partnership.contract_scope && (
                <div>
                  <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>תחום החוזה</h4>
                  <p className="text-sm" style={{ color: 'var(--dash-text)' }}>{partnership.contract_scope}</p>
                </div>
              )}

              {/* Exclusivity */}
              {partnership.exclusivity?.isExclusive && (
                <div className="flex items-center gap-2">
                  <span className="pill pill-amber">אקסקלוסיבי</span>
                  {partnership.exclusivity.categories?.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{partnership.exclusivity.categories.join(', ')}</span>
                  )}
                </div>
              )}

              {/* Termination */}
              {partnership.termination_clauses && partnership.termination_clauses.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>תנאי ביטול</h4>
                  <ul className="text-sm space-y-1" style={{ color: 'var(--dash-text-2)' }}>
                    {partnership.termination_clauses.map((c, i) => <li key={i}>• {c}</li>)}
                  </ul>
                </div>
              )}

              {/* Key Dates */}
              {partnership.key_dates && partnership.key_dates.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>תאריכים חשובים</h4>
                  <div className="space-y-1">
                    {partnership.key_dates.map((kd, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span style={{ color: 'var(--dash-text-2)' }}>{kd.event}</span>
                        <span style={{ color: 'var(--dash-text-3)' }}>{new Date(kd.date).toLocaleDateString('he-IL')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confidentiality */}
              {partnership.confidentiality && (
                <div>
                  <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--dash-text-3)' }}>סודיות</h4>
                  <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>{partnership.confidentiality}</p>
                </div>
              )}

              {/* Auto Renewal */}
              {partnership.auto_renewal && (
                <span className="pill pill-green">
                  חידוש אוטומטי
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Meta ═══ */}
      <div className="text-[11px] text-center" style={{ color: 'var(--dash-text-3)' }}>
        נוצר {new Date(partnership.created_at).toLocaleDateString('he-IL')} · עודכן {new Date(partnership.updated_at).toLocaleDateString('he-IL')}
      </div>
    </div>
  );
}
