'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export default function NewCommunicationPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [partnerships, setPartnerships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    partnership_id: '',
    brand_name: '',
    brand_contact_name: '',
    brand_contact_email: '',
    brand_contact_phone: '',
    subject: '',
    category: 'general',
    priority: 'normal',
    initial_message: '',
    due_date: '',
  });

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    try {
      // Check authentication
      const authRes = await fetch(`/api/influencer/auth?username=${username}`);
      const authData = await authRes.json();

      if (!authData.authenticated) {
        router.push(`/influencer/${username}`);
        return;
      }

      // Load partnerships for dropdown
      const partnershipsRes = await fetch(
        `/api/influencer/partnerships?username=${username}&limit=100`
      );
      if (partnershipsRes.ok) {
        const data = await partnershipsRes.json();
        setPartnerships(data.partnerships || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError('שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/communications?username=${username}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...formData,
            partnership_id: formData.partnership_id || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create communication');
      }

      const { communication } = await response.json();

      if (!communication || !communication.id) {
        throw new Error('התקשורת נוצרה אך לא התקבל מזהה');
      }

      // Redirect to the new communication
      router.push(`/influencer/${username}/communications/${communication.id}`);
    } catch (err: any) {
      console.error('Error creating communication:', err);
      setError(err.message || 'שגיאה ביצירת התקשורת');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-slide-up" style={{ background: 'transparent' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 animate-slide-up" style={{ borderColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 animate-slide-up" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto animate-slide-up">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 mb-4 transition-colors"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <ArrowRight className="w-5 h-5" />
            חזרה
          </button>
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--dash-text)' }}>תקשורת חדשה עם מותג</h1>
          <p style={{ color: 'var(--dash-text-2)' }}>צור שיחה חדשה עם מותג או גורם עסקי</p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--dash-negative) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--dash-negative) 30%, transparent)',
              color: 'var(--dash-negative)',
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-8 border"
          style={{ borderColor: 'var(--dash-glass-border)' }}
        >
          <div className="space-y-6">
            {/* Brand Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                שם המותג *
              </label>
              <input
                type="text"
                required
                value={formData.brand_name}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                placeholder="לדוגמה: Nike Israel"
                className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                נושא השיחה *
              </label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="לדוגמה: בירור לגבי תשלום חסר"
                className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
              />
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  קטגוריה
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl focus:outline-none text-right"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
                >
                  <option value="general">כללי</option>
                  <option value="financial">פיננסי</option>
                  <option value="legal">משפטי</option>
                  <option value="issues">בעיות שת"פ</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  עדיפות
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl focus:outline-none text-right"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
                >
                  <option value="low">נמוך</option>
                  <option value="normal">בינוני</option>
                  <option value="high">גבוה</option>
                  <option value="urgent">דחוף</option>
                </select>
              </div>
            </div>

            {/* Partnership (optional) */}
            <div>
              <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                שת"פ קשור (אופציונלי)
              </label>
              <select
                value={formData.partnership_id}
                onChange={(e) => setFormData({ ...formData, partnership_id: e.target.value })}
                className="w-full px-4 py-3 rounded-xl focus:outline-none text-right"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
              >
                <option value="">ללא שת"פ</option>
                {partnerships.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  שם איש קשר
                </label>
                <input
                  type="text"
                  value={formData.brand_contact_name}
                  onChange={(e) => setFormData({ ...formData, brand_contact_name: e.target.value })}
                  placeholder="יוסי כהן"
                  className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  אימייל
                </label>
                <input
                  type="email"
                  value={formData.brand_contact_email}
                  onChange={(e) => setFormData({ ...formData, brand_contact_email: e.target.value })}
                  placeholder="yossi@brand.com"
                  className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                  טלפון
                </label>
                <input
                  type="tel"
                  value={formData.brand_contact_phone}
                  onChange={(e) => setFormData({ ...formData, brand_contact_phone: e.target.value })}
                  placeholder="050-1234567"
                  className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
                />
              </div>
            </div>

            {/* Initial Message */}
            <div>
              <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                הודעה ראשונית *
              </label>
              <textarea
                required
                value={formData.initial_message}
                onChange={(e) => setFormData({ ...formData, initial_message: e.target.value })}
                rows={6}
                placeholder="שלום,&#10;&#10;אני פונה אליכם בנוגע ל..."
                className="w-full px-4 py-3 rounded-xl placeholder-gray-500 focus:outline-none text-right"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
                תאריך יעד לתגובה
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl focus:outline-none text-right"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
              />
            </div>

            {/* Validation Message */}
            {(!formData.brand_name || !formData.subject || !formData.initial_message) && (
              <div
                className="p-4 rounded-xl text-sm text-right"
                style={{
                  background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
                  color: 'var(--color-warning)',
                }}
              >
                <p className="font-medium mb-1">שדות חובה חסרים:</p>
                <ul className="list-disc list-inside mr-4">
                  {!formData.brand_name && <li>שם המותג</li>}
                  {!formData.subject && <li>נושא השיחה</li>}
                  {!formData.initial_message && <li>הודעה ראשונית</li>}
                </ul>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={creating || !formData.brand_name || !formData.subject || !formData.initial_message}
                className="btn-primary flex-1 px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    יוצר תקשורת...
                  </span>
                ) : (
                  'צור תקשורת'
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 rounded-xl font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--dash-text)' }}
              >
                ביטול
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
