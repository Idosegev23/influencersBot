/**
 * Insights Dashboard - Admin UI
 * תובנות מהשיחות
 */

'use client';

import { useState, useEffect } from 'react';

interface Insight {
  id: string;
  insight_type: string;
  title: string;
  content: string;
  occurrence_count: number;
  confidence_score: number;
  examples: string[];
  created_at: string;
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadInsights();
  }, [filter]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/influencer/chatbot/insights'
        : `/api/influencer/chatbot/insights?type=${filter}`;
      
      const response = await fetch(url);
      const data = await response.json();
      setInsights(data.insights || []);
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const insightTypeLabels: Record<string, string> = {
    faq: '❓ שאלה נפוצה',
    topic_interest: '🔥 נושא חם',
    pain_point: '😓 נקודת כאב',
    feedback: '💬 פידבק',
    objection: '🤔 התנגדות',
    language_pattern: '💭 דפוס שפה',
    product_inquiry: '🛍️ שאלת מוצר',
    coupon_request: '🎁 בקשת קופון',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">תובנות מהשיחות</h1>
          <p className="text-gray-600">
            למידה אוטומטית מהשיחות שלך עם העוקבים
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              הכל
            </button>
            
            {Object.entries(insightTypeLabels).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Insights List */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">טוען תובנות...</p>
            </div>
          ) : insights.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
              אין תובנות עדיין. התובנות נאספות אוטומטית מהשיחות שלך!
            </div>
          ) : (
            insights.map((insight) => (
              <div
                key={insight.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-gray-500">
                        {insightTypeLabels[insight.insight_type] || insight.insight_type}
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                        {insight.occurrence_count} פעמים
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {Math.round(insight.confidence_score * 100)}% ביטחון
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {insight.title}
                    </h3>
                  </div>
                </div>

                {/* Content */}
                <p className="text-gray-700 mb-4">
                  {insight.content}
                </p>

                {/* Examples */}
                {insight.examples && insight.examples.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      דוגמאות מהשיחות:
                    </div>
                    <div className="space-y-2">
                      {insight.examples.slice(0, 3).map((example, idx) => (
                        <div
                          key={idx}
                          className="text-sm text-gray-600 bg-white rounded p-2 border border-gray-200"
                        >
                          💬 "{example}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 text-xs text-gray-400">
                  נוצר: {new Date(insight.created_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 text-xl">💡</div>
            <div className="flex-1">
              <div className="font-medium text-blue-900 mb-1">איך זה עובד?</div>
              <div className="text-sm text-blue-800">
                המערכת מנתחת את השיחות שלך כל יום ומזהה דפוסים חוזרים:
                שאלות נפוצות, נושאים שמעניינים את הקהל, והתנגדויות נפוצות.
                התובנות האלה עוזרות לבוט להשתפר ולענות טוב יותר!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
