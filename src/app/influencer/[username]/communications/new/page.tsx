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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">תקשורת חדשה עם מותג</h1>
          <p className="text-gray-400">צור שיחה חדשה עם מותג או גורם עסקי</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gray-800/50 rounded-xl p-8 border border-gray-700">
          <div className="space-y-6">
            {/* Brand Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                שם המותג *
              </label>
              <input
                type="text"
                required
                value={formData.brand_name}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                placeholder="לדוגמה: Nike Israel"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                נושא השיחה *
              </label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="לדוגמה: בירור לגבי תשלום חסר"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
              />
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  קטגוריה
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none text-right"
                >
                  <option value="general">כללי</option>
                  <option value="financial">פיננסי</option>
                  <option value="legal">משפטי</option>
                  <option value="issues">בעיות שת"פ</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  עדיפות
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none text-right"
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
              <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                שת"פ קשור (אופציונלי)
              </label>
              <select
                value={formData.partnership_id}
                onChange={(e) => setFormData({ ...formData, partnership_id: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none text-right"
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
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  שם איש קשר
                </label>
                <input
                  type="text"
                  value={formData.brand_contact_name}
                  onChange={(e) => setFormData({ ...formData, brand_contact_name: e.target.value })}
                  placeholder="יוסי כהן"
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  אימייל
                </label>
                <input
                  type="email"
                  value={formData.brand_contact_email}
                  onChange={(e) => setFormData({ ...formData, brand_contact_email: e.target.value })}
                  placeholder="yossi@brand.com"
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                  טלפון
                </label>
                <input
                  type="tel"
                  value={formData.brand_contact_phone}
                  onChange={(e) => setFormData({ ...formData, brand_contact_phone: e.target.value })}
                  placeholder="050-1234567"
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
                />
              </div>
            </div>

            {/* Initial Message */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                הודעה ראשונית *
              </label>
              <textarea
                required
                value={formData.initial_message}
                onChange={(e) => setFormData({ ...formData, initial_message: e.target.value })}
                rows={6}
                placeholder="שלום,&#10;&#10;אני פונה אליכם בנוגע ל..."
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none text-right"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-right">
                תאריך יעד לתגובה
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none text-right"
              />
            </div>

            {/* Validation Message */}
            {(!formData.brand_name || !formData.subject || !formData.initial_message) && (
              <div className="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-300 text-sm text-right">
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
                className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
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
