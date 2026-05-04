'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, Copy, Check, TrendingUp, Users, MessageSquare, Tag } from 'lucide-react';

interface AttributionRow {
  slug: string;
  display_name: string;
  sessions: number;
  tickets: number;
  coupon_copies: number;
}

interface AttributionData {
  totals: {
    sessions: number;
    tickets: number;
    couponCopies: number;
    days: number;
    sinceIso: string;
  };
  rows: AttributionRow[];
}

export default function AttributionPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();

  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/influencer/attribution?username=${username}&days=${days}`);
        if (res.status === 401) {
          router.push(`/influencer/${username}/login`);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const j = await res.json();
        if (!cancel) setData(j);
      } catch (e: any) {
        if (!cancel) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [username, days, router]);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/chat/${username}` : `/chat/${username}`;

  const copyLink = async (slug: string) => {
    if (slug === '__direct__') return;
    const link = `${baseUrl}?ref=${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 1800);
    } catch {}
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href={`/influencer/${username}/dashboard`}
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              <ChevronLeft className="w-4 h-4 ml-1" />
              חזרה לדשבורד
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Attribution — לפי משפיענית</h1>
            <p className="text-sm text-gray-500 mt-1">
              ניתוח של תנועה, פניות והעתקות קופון לפי המקור שהביא את הלקוחה
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">טווח:</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value={7}>7 ימים</option>
              <option value={14}>14 ימים</option>
              <option value={30}>30 יום</option>
              <option value={60}>60 יום</option>
              <option value={90}>90 יום</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            שגיאה בטעינת הנתונים: {error}
          </div>
        )}

        {data && !loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">סשנים</span>
                  <Users className="w-5 h-5 text-purple-500" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{data.totals.sessions}</div>
                <div className="text-xs text-gray-400 mt-1">{data.totals.days} ימים אחרונים</div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">פניות תמיכה</span>
                  <MessageSquare className="w-5 h-5 text-pink-500" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{data.totals.tickets}</div>
                <div className="text-xs text-gray-400 mt-1">בתקופה</div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">העתקות קופון</span>
                  <Tag className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{data.totals.couponCopies}</div>
                <div className="text-xs text-gray-400 mt-1">סך הכל היסטורי</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-500" />
                <h2 className="font-semibold text-gray-900">פירוט לפי מקור</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">משפיענית / מקור</th>
                      <th className="px-4 py-3 text-right font-medium">סשנים</th>
                      <th className="px-4 py-3 text-right font-medium">פניות</th>
                      <th className="px-4 py-3 text-right font-medium">העתקות קופון</th>
                      <th className="px-4 py-3 text-right font-medium">לינק לשיתוף</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((r) => {
                      const isDirect = r.slug === '__direct__';
                      return (
                        <tr key={r.slug} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{r.display_name}</td>
                          <td className="px-4 py-3 text-gray-700">{r.sessions}</td>
                          <td className="px-4 py-3 text-gray-700">{r.tickets}</td>
                          <td className="px-4 py-3 text-gray-700">{r.coupon_copies}</td>
                          <td className="px-4 py-3">
                            {isDirect ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <button
                                onClick={() => copyLink(r.slug)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition text-xs font-medium"
                              >
                                {copiedSlug === r.slug ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    הועתק
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    {`?ref=${r.slug}`}
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          אין נתונים בתקופה זו
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-900">
              💡 איך זה עובד? כל משפיענית מקבלת לינק עם <code className="bg-white px-1.5 py-0.5 rounded text-purple-700">?ref=&lt;שם&gt;</code>.
              ברגע שלקוחה נכנסת דרך הלינק — הסשן + כל הפניות שלה משויכים למשפיענית הזו, גם אם תרענן או תשוב מאוחר יותר.
              <br />
              <br />
              <b>חשוב:</b> ה-Attribution קובע <u>איך הגיעו</u> אל הבוט, לא איזה קוד הועתק. עמודת "העתקות קופון" היא ספירה גלובלית של כמה פעמים הקוד הועתק (ללא קשר למקור הסשן).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
