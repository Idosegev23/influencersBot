'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  MessageCircle,
  Settings,
  BarChart3,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  FileText,
  Upload,
  Trash2,
  Loader2,
  Instagram,
  Copy,
  Link2,
  ExternalLink,
} from 'lucide-react';

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

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#f87171' }} />
          <div className="text-xl mb-2" style={{ color: '#ede9f8' }}>משפיענית לא נמצאה</div>
          <Link href="/admin/influencers" className="hover:underline" style={{ color: '#a094e0' }}>
            חזרה לרשימה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/influencers"
            className="w-10 h-10 flex items-center justify-center rounded-full transition-all"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <ArrowRight className="w-5 h-5" style={{ color: '#ede9f8' }} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{influencer.displayName}</h1>
            <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>@{influencer.username}</p>
          </div>
          <div className="mr-auto flex gap-2">
            <Link
              href={`/chat/${influencer.username}`}
              target="_blank"
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" />
              צפייה בצ'אט
            </Link>
            <Link
              href={`/admin/chatbot-persona/${id}`}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              <Settings className="w-4 h-4" />
              הגדרות פרסונה
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Persona Status */}
            <div className="admin-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold" style={{ color: '#ede9f8' }}>סטטוס הפרסונה</h2>
                <button
                  onClick={rebuildPersona}
                  disabled={rebuilding}
                  className="btn-coral flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                  {rebuilding ? 'בונה...' : 'בניה מחדש'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl" style={influencer.persona.hasGemini
                  ? { background: 'rgba(94, 234, 212, 0.06)', border: '1px solid rgba(94, 234, 212, 0.15)' }
                  : { background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }
                }>
                  <div className="flex items-center gap-2 mb-2">
                    {influencer.persona.hasGemini ? (
                      <CheckCircle className="w-5 h-5" style={{ color: '#5eead4' }} />
                    ) : (
                      <AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} />
                    )}
                    <span className="font-medium" style={{ color: '#ede9f8' }}>Gemini Output</span>
                  </div>
                  <p className="text-sm" style={{ color: influencer.persona.hasGemini ? '#5eead4' : '#f87171' }}>
                    {influencer.persona.hasGemini ? 'קיים ✓' : 'חסר - יש לבנות'}
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={influencer.persona.instagramUsername
                  ? { background: 'rgba(94, 234, 212, 0.06)', border: '1px solid rgba(94, 234, 212, 0.15)' }
                  : { background: 'rgba(224, 164, 148, 0.06)', border: '1px solid rgba(224, 164, 148, 0.15)' }
                }>
                  <div className="flex items-center gap-2 mb-2">
                    {influencer.persona.instagramUsername ? (
                      <CheckCircle className="w-5 h-5" style={{ color: '#5eead4' }} />
                    ) : (
                      <AlertCircle className="w-5 h-5" style={{ color: '#e0a494' }} />
                    )}
                    <span className="font-medium" style={{ color: '#ede9f8' }}>Instagram Username</span>
                  </div>
                  <p className="text-sm" style={{ color: influencer.persona.instagramUsername ? '#5eead4' : '#e0a494' }}>
                    {influencer.persona.instagramUsername || 'לא מוגדר'}
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <div className="text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מוצרים</div>
                  <div className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{influencer.persona.productsCount}</div>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <div className="text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מותגים</div>
                  <div className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{influencer.persona.brandsCount}</div>
                </div>
              </div>
            </div>

            {/* Content Stats */}
            <div className="admin-card p-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: '#ede9f8' }}>תוכן</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'פוסטים', value: influencer.stats.posts },
                  { label: 'תמלולים', value: influencer.stats.transcriptions },
                  { label: 'אתרים', value: influencer.stats.websites },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <div className="text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{stat.label}</div>
                    <div className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Commerce */}
            <div className="admin-card p-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: '#ede9f8' }}>מסחר</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'קופונים (DB)', value: influencer.stats.coupons },
                  { label: 'שיתופי פעולה', value: influencer.stats.partnerships },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <div className="text-sm mb-1" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{stat.label}</div>
                    <div className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents */}
            <div className="admin-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#ede9f8' }}>
                  <FileText className="w-5 h-5" />
                  מסמכים ({documents.length})
                </h2>
                <div>
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
                    className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'מעלה...' : 'העלאת מסמך'}
                  </button>
                </div>
              </div>

              {docsLoading ? (
                <div className="text-center py-4" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>טוען מסמכים...</div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto mb-2" style={{ color: 'rgba(237, 233, 248, 0.15)' }} />
                  <p style={{ color: 'rgba(237, 233, 248, 0.3)' }}>אין מסמכים עדיין</p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(237, 233, 248, 0.2)' }}>העלה PDF, מצגות, או מסמכים שייכנסו למאגר הידע של הבוט</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(237, 233, 248, 0.3)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: '#ede9f8' }}>{doc.filename}</div>
                        <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                          <span>{doc.document_type}</span>
                          <span>·</span>
                          <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                          <span>·</span>
                          <span style={{
                            color: doc.parsing_status === 'completed' ? '#5eead4' :
                            doc.parsing_status === 'failed' ? '#f87171' :
                            doc.parsing_status === 'processing' ? '#e0a494' :
                            'rgba(237, 233, 248, 0.3)'
                          }}>
                            {doc.parsing_status === 'completed' ? 'נותח' :
                             doc.parsing_status === 'failed' ? 'נכשל' :
                             doc.parsing_status === 'processing' ? 'מנתח...' :
                             'ממתין'}
                          </span>
                          {doc.parsing_confidence != null && doc.parsing_confidence > 0 && (
                            <>
                              <span>·</span>
                              <span>{(doc.parsing_confidence * 100).toFixed(0)}%</span>
                            </>
                          )}
                          {doc.ai_model_used && (
                            <>
                              <span>·</span>
                              <span>{doc.ai_model_used}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        className="p-1.5 transition-colors rounded-full"
                        style={{ color: 'rgba(237, 233, 248, 0.25)' }}
                        title="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-6">
            {/* Chat Config */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-bold mb-4" style={{ color: '#ede9f8' }}>הגדרות צ'אט</h2>

              <div className="mb-4">
                <div className="text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>הודעת פתיחה</div>
                <div className="text-sm rounded-xl p-3" style={{ color: '#ede9f8', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  {influencer.chatConfig.greeting || 'לא מוגדרת'}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>שאלות מוכנות</div>
                <div className="space-y-2">
                  {influencer.chatConfig.questions.map((q, i) => (
                    <div key={i} className="text-sm rounded-xl p-2" style={{ color: '#ede9f8', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      {i + 1}. {q}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>ערכת צבעים</div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="text-xs mb-1" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>ראשי</div>
                    <div
                      className="h-10 rounded-xl"
                      style={{ backgroundColor: influencer.chatConfig.theme.primary }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs mb-1" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>רקע</div>
                    <div
                      className="h-10 rounded-xl"
                      style={{ backgroundColor: influencer.chatConfig.theme.background, border: '1px solid rgba(255, 255, 255, 0.06)' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Instagram Connection */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#ede9f8' }}>
                <Instagram className="w-5 h-5" style={{ color: '#E1306C' }} />
                חיבור אינסטגרם
              </h2>

              {/* Connection Status */}
              <div className="p-3 rounded-xl mb-4" style={igConnection?.is_active
                ? { background: 'rgba(94, 234, 212, 0.06)', border: '1px solid rgba(94, 234, 212, 0.15)' }
                : { background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }
              }>
                <div className="flex items-center gap-2">
                  {igConnection?.is_active ? (
                    <>
                      <CheckCircle className="w-4 h-4" style={{ color: '#5eead4' }} />
                      <span className="text-sm font-medium" style={{ color: '#5eead4' }}>
                        מחובר — @{igConnection.ig_username}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" style={{ color: 'rgba(237, 233, 248, 0.35)' }} />
                      <span className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                        לא מחובר
                      </span>
                    </>
                  )}
                </div>
                {igConnection?.connected_at && (
                  <div className="text-xs mt-1 mr-6" style={{ color: 'rgba(237, 233, 248, 0.25)' }}>
                    חובר ב-{new Date(igConnection.connected_at).toLocaleDateString('he-IL')}
                  </div>
                )}
              </div>

              {/* Copy Account ID */}
              <div className="space-y-2">
                <button
                  onClick={() => copyToClipboard(id, 'id')}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-sm transition-all"
                  style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                >
                  <div className="flex items-center gap-2" style={{ color: '#ede9f8' }}>
                    <Copy className="w-4 h-4" />
                    <span>העתק Account ID</span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: copiedId ? '#5eead4' : 'rgba(237, 233, 248, 0.3)' }}>
                    {copiedId ? 'הועתק!' : id.slice(0, 8) + '...'}
                  </span>
                </button>

                {/* Copy OAuth Link */}
                <button
                  onClick={() => copyToClipboard(igConnectLink, 'link')}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-sm transition-all"
                  style={{ background: 'rgba(225, 48, 108, 0.06)', border: '1px solid rgba(225, 48, 108, 0.15)' }}
                >
                  <div className="flex items-center gap-2" style={{ color: '#ede9f8' }}>
                    <Link2 className="w-4 h-4" style={{ color: '#E1306C' }} />
                    <span>העתק קישור התחברות</span>
                  </div>
                  <span className="text-xs" style={{ color: copiedLink ? '#5eead4' : 'rgba(237, 233, 248, 0.3)' }}>
                    {copiedLink ? 'הועתק!' : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-bold mb-4" style={{ color: '#ede9f8' }}>פעולות</h2>
              <div className="space-y-2">
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
                  className="btn-primary block w-full text-center text-sm py-2.5"
                >
                  דף ניהול
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('להתחיל תמלול מלא? זה עלול לקחת כמה דקות.')) return;
                    try {
                      await fetch(`/api/process/start?accountId=${id}`, { method: 'POST' });
                      alert('תמלול מלא הותחל');
                    } catch {
                      alert('שגיאה בהפעלת תמלול');
                    }
                  }}
                  className="btn-coral block w-full text-center text-sm py-2.5"
                >
                  תמלול מלא
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
