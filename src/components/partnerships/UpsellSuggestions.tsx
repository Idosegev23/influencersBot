'use client';

import { useEffect, useState } from 'react';

type UpsellSuggestion = {
  partnership_id: string;
  partnership_name: string;
  brand_name: string;
  suggestion_type: 'renewal' | 'upsell' | 'expansion';
  confidence_score: number;
  reasons: string[];
  metrics: {
    roi: number;
    engagement: number;
    revenue: number;
    usage_count: number;
    satisfaction_score?: number;
  };
  recommendation: string;
  next_steps: string[];
  suggested_offer?: {
    type: string;
    value: number;
    description: string;
  };
};

export default function UpsellSuggestions() {
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/influencer/upsell-suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-2">המלצות להמשך פעילות</h3>
        <p className="text-gray-500">אין כרגע המלצות לחידוש או הרחבת שיתופי פעולה</p>
      </div>
    );
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 70) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'renewal': return 'חידוש';
      case 'upsell': return 'הרחבה';
      case 'expansion': return 'הגדלה';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'renewal': return '🔄';
      case 'upsell': return '⬆️';
      case 'expansion': return '📈';
      default: return '💡';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        המלצות להמשך פעילות
      </h2>

      {suggestions.map((suggestion) => (
        <div
          key={suggestion.partnership_id}
          className={`bg-white rounded-lg shadow-lg border-2 p-6 ${getConfidenceColor(suggestion.confidence_score)}`}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl">{getTypeIcon(suggestion.suggestion_type)}</span>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {suggestion.brand_name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {suggestion.partnership_name}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs text-gray-600 mb-1">רמת ביטחון</div>
              <div className="text-3xl font-bold">
                {suggestion.confidence_score}%
              </div>
              <div className="text-xs font-medium mt-1">
                {getTypeLabel(suggestion.suggestion_type)}
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-white bg-opacity-50 rounded-lg p-4 mb-4">
            <p className="text-gray-900 font-medium text-lg">
              {suggestion.recommendation}
            </p>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {suggestion.metrics.roi.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-600">ROI</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                ₪{suggestion.metrics.revenue.toLocaleString()}
              </div>
              <div className="text-xs text-gray-600">הכנסות</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {suggestion.metrics.engagement.toFixed(0)}
              </div>
              <div className="text-xs text-gray-600">מעורבות</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {suggestion.metrics.usage_count}
              </div>
              <div className="text-xs text-gray-600">שימושים</div>
            </div>
          </div>

          {/* Reasons */}
          <div className="mb-4">
            <h4 className="font-semibold text-gray-900 mb-2">למה?</h4>
            <ul className="space-y-1">
              {suggestion.reasons.map((reason, idx) => (
                <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Next Steps */}
          <div className="mb-4">
            <h4 className="font-semibold text-gray-900 mb-2">השלבים הבאים:</h4>
            <ol className="space-y-1">
              {suggestion.next_steps.map((step, idx) => (
                <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="font-bold text-blue-600">{idx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Suggested Offer */}
          {suggestion.suggested_offer && (
            <div className="bg-gradient-to-l from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">💰 ההצעה המומלצת</h4>
              <p className="text-sm text-gray-700 mb-2">
                {suggestion.suggested_offer.description}
              </p>
              <div className="text-2xl font-bold text-blue-600">
                ₪{suggestion.suggested_offer.value.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
