'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface AdminDocument {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  parsing_status: string;
  parsing_confidence: number | null;
  ai_model_used: string | null;
  uploaded_at: string;
  parsed_at: string | null;
}

interface InfluencerDetails {
  id: string;
  username: string;
  displayName: string;
  type: string;
  status: string;
  persona: {
    name: string;
    tone: string;
    instagramUsername: string | null;
    hasGemini: boolean;
    productsCount: number;
    brandsCount: number;
    couponsInGemini: number;
  };
  stats: {
    posts: number;
    transcriptions: number;
    coupons: number;
    partnerships: number;
    websites: number;
  };
  chatConfig: {
    greeting: string;
    questions: string[];
    theme: {
      primary: string;
      background: string;
    };
  };
}

export default function InfluencerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [influencer, setInfluencer] = useState<InfluencerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [igConnection, setIgConnection] = useState<{ ig_username: string; is_active: boolean; connected_at: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dmBotEnabled, setDmBotEnabled] = useState(false);
  const [dmToggling, setDmToggling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInfluencer();
    loadDocuments();
    loadIgConnection();
  }, [id]);

  async function loadDocuments() {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/admin/documents?accountId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setDocsLoading(false);
    }
  }

  async function loadIgConnection() {
    try {
      const res = await fetch(`/api/admin/ig-connection?accountId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setIgConnection(data.connection || null);
      }
    } catch (error) {
      console.error('Error loading IG connection:', error);
    }
    // Load DM bot status
    try {
      const res = await fetch(`/api/influencer/dm-settings?accountId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setDmBotEnabled(data.dm_bot_enabled === true);
      }
    } catch (error) {
      console.error('Error loading DM settings:', error);
    }
  }

  async function toggleDmBot() {
    setDmToggling(true);
    try {
      const res = await fetch('/api/influencer/dm-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, dm_bot_enabled: !dmBotEnabled }),
      });
      if (res.ok) {
        setDmBotEnabled(!dmBotEnabled);
      } else {
        alert('שגיאה בעדכון הגדרות DM');
      }
    } catch {
      alert('שגיאה בעדכון הגדרות DM');
    } finally {
      setDmToggling(false);
    }
  }

  function copyToClipboard(text: string, type: 'id' | 'link') {
    navigator.clipboard.writeText(text);
    if (type === 'id') { setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }
    else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
  }

  const igConnectLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/instagram/connect?accountId=${id}`;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append('files', file);
      }
      formData.append('accountId', id);
      formData.append('documentType', 'other');

      const res = await fetch('/api/influencer/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setTimeout(() => loadDocuments(), 2000);
      } else {
        const data = await res.json();
        alert(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteDocument(docId: string) {
    if (!confirm('למחוק מסמך זה?')) return;

    try {
      const res = await fetch(`/api/admin/documents?documentId=${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      } else {
        alert('Failed to delete');
      }
    } catch (error) {
      alert('Failed to delete');
    }
  }

  async function loadInfluencer() {
    try {
      const res = await fetch(`/api/admin/influencers/${id}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setInfluencer(data.influencer);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function rebuildPersona() {
    if (!confirm('לבנות מחדש את הפרסונה? (לוקח כ-2 דקות)')) return;

    setRebuilding(true);
    try {
      const res = await fetch('/api/persona/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id })
      });

      if (res.ok) {
        alert('הפרסונה נבנתה מחדש בהצלחה!');
        loadInfluencer();
      } else {
        alert('שגיאה בבניית הפרסונה');
      }
    } catch (error) {
      alert('שגיאה בבניית הפרסונה');
    } finally {
      setRebuilding(false);
    }
  }

  /* ---------- helper: doc status pill colors ---------- */
  const statusPillStyle = (status: string) => {
    if (status === 'completed' || status === 'success')
      return { backgroundColor: 'rgba(23, 163, 74, 0.15)', color: '#059669' };
    if (status === 'processing')
      return { backgroundColor: 'rgba(147, 52, 235, 0.2)', color: '#9334EB' };
    if (status === 'failed')
      return { backgroundColor: 'rgba(220, 38, 39, 0.15)', color: '#DC2627' };
    return { backgroundColor: 'rgba(186, 177, 161, 0.2)', color: '#4b5563' };
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-[3px] border-[#9334EB] border-t-transparent animate-spin" />
      </div>
    );
  }

  // --- Not found state ---
  if (!influencer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl mb-4 block" style={{ color: '#DC2627' }}>error</span>
          <div className="text-xl mb-2 font-extrabold text-[#474747]">משפיענית לא נמצאה</div>
          <Link href="/admin/influencers" className="text-[#9334EB] hover:underline font-medium">
            חזרה לרשימה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ============ Page Header ============ */}
      <div className="flex flex-wrap items-center gap-5">
        {/* Back button */}
        <Link
          href="/admin/influencers"
          className="w-12 h-12 flex items-center justify-center rounded-full border border-[#d1d5db]/30 bg-white hover:shadow-md transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ color: '#474747' }}>arrow_forward</span>
        </Link>

        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-[3px] border-[#9334EB] bg-gradient-to-br from-[#9334EB]/30 to-[#2663EB]/30 flex items-center justify-center text-2xl font-black text-[#474747]">
              {influencer.displayName.charAt(0)}
            </div>
            {influencer.persona.hasGemini && (
              <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-[#9334EB] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[12px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#474747]">{influencer.displayName}</h1>
            <p className="text-[#4b5563]">@{influencer.username}</p>
          </div>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap gap-3 mr-auto">
          <button
            onClick={rebuildPersona}
            disabled={rebuilding}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#d1d5db]/40 text-sm font-semibold text-[#474747] bg-white hover:border-[#9334EB] hover:text-[#059669] transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${rebuilding ? 'animate-spin' : ''}`}>refresh</span>
            {rebuilding ? 'בונה...' : 'בנה פרסונה מחדש'}
          </button>
          <Link
            href={`/chat/${influencer.username}`}
            target="_blank"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#d1d5db]/40 text-sm font-semibold text-[#474747] bg-white hover:border-[#2663EB] hover:text-[#9334EB] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            צפה בצ&apos;אט
          </Link>
          <Link
            href={`/admin/chatbot-persona/${id}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
            style={{ background: 'linear-gradient(135deg, #9334EB 0%, #2663EB 100%)' }}
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
            עריכת פרסונה
          </Link>
        </div>
      </div>

      {/* ============ Two-column layout ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ---------- Left column (2/3) ---------- */}
        <div className="lg:col-span-2 space-y-8">

          {/* A. Profile Card */}
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            {/* Category + plan badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(147, 52, 235, 0.2)', color: '#9334EB' }}>
                {influencer.type}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(23, 163, 74, 0.15)', color: '#059669' }}>
                {influencer.status}
              </span>
              {influencer.persona.hasGemini && (
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(23, 163, 74, 0.15)', color: '#059669' }}>
                  Gemini Ready
                </span>
              )}
              {!influencer.persona.hasGemini && (
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(220, 38, 39, 0.15)', color: '#DC2627' }}>
                  חסר Gemini
                </span>
              )}
            </div>

            {/* Bio / persona name */}
            {influencer.persona.name && influencer.persona.name !== 'N/A' && (
              <p className="text-[#4b5563] mb-6 leading-relaxed">{influencer.persona.name}</p>
            )}

            {/* Stats grid 2x3 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'פוסטים', value: influencer.stats.posts, icon: 'article' },
                { label: 'תמלולים', value: influencer.stats.transcriptions, icon: 'subtitles' },
                { label: 'קופונים', value: influencer.stats.coupons, icon: 'confirmation_number' },
                { label: 'שיתופי פעולה', value: influencer.stats.partnerships, icon: 'handshake' },
                { label: 'מסמכים', value: documents.length, icon: 'description' },
                { label: 'אתרים', value: influencer.stats.websites, icon: 'language' },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#f3f4f6] p-4 rounded-2xl text-center">
                  <div className="text-2xl font-black" style={{ color: '#9334EB' }}>{stat.value}</div>
                  <div className="text-xs uppercase tracking-wider text-[#4b5563] mt-1 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* B. Persona Section */}
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(23, 163, 74, 0.12)' }}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: '#9334EB' }}>psychology</span>
              </div>
              <h2 className="text-lg font-extrabold text-[#474747]">הגדרות פרסונה (AI)</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-[#4b5563] block mb-1.5">טון</label>
                <div className="bg-[#f3f4f6] rounded-xl p-3 text-sm text-[#474747]">
                  {influencer.persona.tone || 'לא מוגדר'}
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-[#4b5563] block mb-1.5">מוצרים</label>
                <div className="bg-[#f3f4f6] rounded-xl p-3 text-sm text-[#474747]">
                  {influencer.persona.productsCount} מוצרים, {influencer.persona.brandsCount} מותגים
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-[#4b5563] block mb-1.5">קופונים ב-Gemini</label>
                <div className="bg-[#f3f4f6] rounded-xl p-3 text-sm text-[#474747]">
                  {influencer.persona.couponsInGemini}
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-[#4b5563] block mb-1.5">הודעת פתיחה</label>
                <div className="bg-[#f3f4f6] rounded-xl p-3 text-sm text-[#474747] line-clamp-2">
                  {influencer.chatConfig.greeting || 'לא מוגדרת'}
                </div>
              </div>
            </div>

            {/* Suggested questions */}
            {influencer.chatConfig.questions.length > 0 && (
              <div className="mt-4">
                <label className="text-sm font-bold text-[#4b5563] block mb-1.5">שאלות מוכנות</label>
                <div className="space-y-2">
                  {influencer.chatConfig.questions.map((q, i) => (
                    <div key={i} className="bg-[#f3f4f6] rounded-xl p-3 text-sm text-[#474747]">
                      {i + 1}. {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* C. Documents Section */}
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(147, 52, 235, 0.15)' }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#2663EB' }}>description</span>
                </div>
                <h2 className="text-lg font-extrabold text-[#474747]">מסמכים ({documents.length})</h2>
              </div>
            </div>

            {/* Upload zone */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.doc,.ppt,.xlsx,.xls,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full mb-6 border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              style={{
                borderColor: 'rgba(23, 163, 74, 0.15)',
                backgroundColor: 'rgba(23, 163, 74, 0.04)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#9334EB'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(23, 163, 74, 0.15)'; }}
            >
              <span className={`material-symbols-outlined text-[32px] ${uploading ? 'animate-spin' : ''}`} style={{ color: '#9334EB' }}>
                {uploading ? 'progress_activity' : 'cloud_upload'}
              </span>
              <span className="text-sm font-medium text-[#4b5563]">
                {uploading ? 'מעלה...' : 'לחץ להעלאת מסמכים (PDF, מצגות, תמונות)'}
              </span>
            </button>

            {/* Document list */}
            {docsLoading ? (
              <div className="text-center py-4 text-[#d1d5db]">טוען מסמכים...</div>
            ) : documents.length === 0 ? (
              <div className="text-center py-6 text-[#d1d5db]">
                <span className="material-symbols-outlined text-[40px] mb-2 block opacity-30">description</span>
                <p>אין מסמכים עדיין</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const pill = statusPillStyle(doc.parsing_status);
                  return (
                    <div key={doc.id} className="bg-[#f3f4f6] rounded-xl p-4 flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={{ color: '#d1d5db' }}>description</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#474747] truncate">{doc.filename}</div>
                        <div className="flex items-center gap-2 text-xs mt-1 text-[#d1d5db]">
                          <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                          <span>&middot;</span>
                          <span>{new Date(doc.uploaded_at).toLocaleDateString('he-IL')}</span>
                          {doc.parsing_confidence != null && doc.parsing_confidence > 0 && (
                            <>
                              <span>&middot;</span>
                              <span>{(doc.parsing_confidence * 100).toFixed(0)}%</span>
                            </>
                          )}
                          {doc.ai_model_used && (
                            <>
                              <span>&middot;</span>
                              <span>{doc.ai_model_used}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                        style={pill}
                      >
                        {doc.parsing_status === 'completed' ? 'נותח' :
                         doc.parsing_status === 'failed' ? 'נכשל' :
                         doc.parsing_status === 'processing' ? 'מנתח...' :
                         'ממתין'}
                      </span>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        className="p-2 rounded-full transition-colors"
                        style={{ color: '#d1d5db' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#DC2627'; (e.currentTarget as HTMLElement).style.backgroundColor = '#FFE2E3'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#d1d5db'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                        title="מחק"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Right column (1/3) ---------- */}
        <div className="space-y-8">

          {/* D. IG Connection Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderRight: '6px solid #9334EB' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
              >
                <span className="material-symbols-outlined text-[20px] text-white">photo_camera</span>
              </div>
              <div>
                <h3 className="font-bold text-[#474747]">חיבור אינסטגרם</h3>
                <p className="text-xs text-[#4b5563]">
                  {igConnection?.is_active
                    ? `מחובר — @${igConnection.ig_username}`
                    : 'לא מחובר'}
                </p>
              </div>
              {igConnection?.is_active && (
                <span className="material-symbols-outlined text-[20px] mr-auto" style={{ color: '#9334EB', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              )}
            </div>

            {igConnection?.connected_at && (
              <p className="text-xs text-[#d1d5db] mb-4">
                חובר ב-{new Date(igConnection.connected_at).toLocaleDateString('he-IL')}
              </p>
            )}

            {/* DM Bot toggle */}
            {igConnection?.is_active && (
              <div className="bg-[#f3f4f6] rounded-2xl p-4 flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-[#474747]">בוט DM</div>
                  <div className="text-xs text-[#4b5563] mt-0.5">תשובות אוטומטיות</div>
                </div>
                <button
                  onClick={toggleDmBot}
                  disabled={dmToggling}
                  className="relative w-12 h-6 rounded-full transition-colors duration-200"
                  style={{
                    backgroundColor: dmBotEnabled ? '#9334EB' : '#d1d5db',
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{
                      transform: dmBotEnabled ? 'translateX(26px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            )}

            {/* Copy buttons */}
            <div className="space-y-2">
              <button
                onClick={() => copyToClipboard(id, 'id')}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-sm bg-[#f3f4f6] hover:bg-[#f5ece0] transition-colors"
              >
                <div className="flex items-center gap-2 text-[#474747]">
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                  <span>העתק Account ID</span>
                </div>
                <span className="text-xs font-mono" style={{ color: copiedId ? '#9334EB' : '#d1d5db' }}>
                  {copiedId ? 'הועתק!' : id.slice(0, 8) + '...'}
                </span>
              </button>

              <button
                onClick={() => copyToClipboard(igConnectLink, 'link')}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-sm transition-colors"
                style={{ backgroundColor: 'rgba(220, 38, 39, 0.04)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFE2E3'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(220, 38, 39, 0.04)'; }}
              >
                <div className="flex items-center gap-2 text-[#474747]">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: '#DC2627' }}>link</span>
                  <span>העתק קישור התחברות</span>
                </div>
                <span className="text-xs" style={{ color: copiedLink ? '#9334EB' : '#d1d5db' }}>
                  {copiedLink ? 'הועתק!' : ''}
                </span>
              </button>
            </div>
          </div>

          {/* E. AI Insight Card */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: 'rgba(23, 163, 74, 0.04)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#DC2627' }}>auto_awesome</span>
              <h3 className="text-sm font-bold" style={{ color: '#DC2627' }}>AI Insight</h3>
            </div>
            <p className="text-sm text-[#4b5563] leading-relaxed mb-3">
              {influencer.persona.hasGemini
                ? `הפרסונה מוכנה עם ${influencer.persona.productsCount} מוצרים ו-${influencer.persona.brandsCount} מותגים.`
                : 'הפרסונה טרם נבנתה. לחץ על "בנה פרסונה מחדש" כדי להתחיל.'}
            </p>
            <Link
              href={`/admin/chatbot-persona/${id}`}
              className="text-sm font-semibold inline-flex items-center gap-1 transition-colors"
              style={{ color: '#9334EB' }}
            >
              עריכת פרסונה
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </Link>
          </div>

          {/* F. Integrations Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-[#474747] mb-4">אינטגרציות</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]" style={{ color: '#d1d5db' }}>photo_camera</span>
                <span className="text-sm text-[#474747] flex-1">Instagram</span>
                <span className="text-xs font-medium" style={{ color: igConnection?.is_active ? '#059669' : '#d1d5db' }}>
                  {igConnection?.is_active ? 'מחובר' : 'לא מחובר'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]" style={{ color: '#d1d5db' }}>psychology</span>
                <span className="text-sm text-[#474747] flex-1">Gemini Output</span>
                <span className="text-xs font-medium" style={{ color: influencer.persona.hasGemini ? '#059669' : '#DC2627' }}>
                  {influencer.persona.hasGemini ? 'קיים' : 'חסר'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]" style={{ color: '#d1d5db' }}>language</span>
                <span className="text-sm text-[#474747] flex-1">אתרים</span>
                <span className="text-xs font-medium text-[#4b5563]">{influencer.stats.websites}</span>
              </div>
            </div>
          </div>

          {/* Color theme preview */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-[#474747] mb-4">ערכת צבעים</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-xs text-[#4b5563] mb-1">ראשי</div>
                <div className="h-10 rounded-xl shadow-inner" style={{ backgroundColor: influencer.chatConfig.theme.primary }} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#4b5563] mb-1">רקע</div>
                <div className="h-10 rounded-xl shadow-inner" style={{ backgroundColor: influencer.chatConfig.theme.background, border: '1px solid rgba(186, 177, 161, 0.2)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ Actions Footer ============ */}
      <div className="rounded-3xl p-6 flex flex-wrap items-center gap-3" style={{ backgroundColor: 'rgba(243, 244, 246, 0.5)', border: '1px solid rgba(255, 255, 255, 0.4)' }}>
        <button
          onClick={async () => {
            try {
              const res = await fetch('/api/admin/websites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: id }),
              });
              const data = await res.json();
              if (data.token) {
                window.open(`/manage/${data.token}`, '_blank');
              } else {
                alert('שגיאה ביצירת קישור ניהול');
              }
            } catch {
              alert('שגיאה ביצירת קישור ניהול');
            }
          }}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#474747] bg-white shadow-sm transition-all"
          style={{ border: '1px solid rgba(186, 177, 161, 0.2)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#9334EB'; (e.currentTarget as HTMLElement).style.borderColor = '#9334EB'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#474747'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(186, 177, 161, 0.2)'; }}
        >
          דף ניהול
        </button>
        <button
          onClick={async () => {
            if (!confirm('להתחיל סריקה מלאה? זה עלול לקחת כמה דקות.')) return;
            try {
              await fetch(`/api/process/start?accountId=${id}`, { method: 'POST' });
              alert('סריקה מלאה הותחלה');
            } catch {
              alert('שגיאה בהפעלת סריקה');
            }
          }}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#474747] bg-white shadow-sm transition-all"
          style={{ border: '1px solid rgba(186, 177, 161, 0.2)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#9334EB'; (e.currentTarget as HTMLElement).style.borderColor = '#9334EB'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#474747'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(186, 177, 161, 0.2)'; }}
        >
          סריקה מלאה
        </button>
        <button
          onClick={async () => {
            if (!confirm('להריץ Re-embed RAG?')) return;
            try {
              await fetch('/api/admin/rag-rebuild', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: id }),
              });
              alert('Re-embed RAG הותחל');
            } catch {
              alert('שגיאה בהפעלת Re-embed');
            }
          }}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#474747] bg-white shadow-sm transition-all"
          style={{ border: '1px solid rgba(186, 177, 161, 0.2)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#9334EB'; (e.currentTarget as HTMLElement).style.borderColor = '#9334EB'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#474747'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(186, 177, 161, 0.2)'; }}
        >
          Re-embed RAG
        </button>
        <div className="flex-1" />
        <button
          onClick={async () => {
            if (!confirm('האם אתה בטוח שברצונך למחוק חשבון זה? פעולה זו אינה הפיכה!')) return;
            try {
              const res = await fetch(`/api/admin/influencers/${id}`, { method: 'DELETE' });
              if (res.ok) {
                window.location.href = '/admin/influencers';
              } else {
                alert('שגיאה במחיקה');
              }
            } catch {
              alert('שגיאה במחיקה');
            }
          }}
          className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
          style={{ color: '#DC2627', backgroundColor: '#FFE2E3', border: '1px solid rgba(220, 38, 39, 0.15)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(220, 38, 39, 0.15)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFE2E3'; }}
        >
          מחק חשבון
        </button>
      </div>
    </div>
  );
}
