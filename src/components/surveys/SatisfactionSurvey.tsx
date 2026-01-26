'use client';

import { useState } from 'react';

type SatisfactionSurveyProps = {
  surveyId: string;
  surveyType?: 'nps' | 'csat' | 'ces';
  title?: string;
  subtitle?: string;
  onComplete?: () => void;
};

export default function SatisfactionSurvey({
  surveyId,
  surveyType = 'nps',
  title,
  subtitle,
  onComplete,
}: SatisfactionSurveyProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const maxScore = surveyType === 'nps' ? 10 : 5;
  const scores = Array.from({ length: maxScore }, (_, i) => i + 1);

  const handleSubmit = async () => {
    if (!score) {
      alert('אנא בחר ציון');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/surveys/${surveyId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score,
          feedback: feedback || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      setSubmitted(true);
      onComplete?.();
    } catch (error) {
      console.error('Failed to submit survey:', error);
      alert('שגיאה בשליחת הסקר');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md mx-auto">
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          תודה רבה!
        </h3>
        <p className="text-gray-600">
          המשוב שלך חשוב לנו ומסייע לנו להשתפר
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
      {/* Title */}
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          {title || 'מה דעתך?'}
        </h3>
        {subtitle && (
          <p className="text-gray-600">{subtitle}</p>
        )}
      </div>

      {/* Score Selection */}
      <div className="mb-6">
        <p className="text-center text-gray-700 mb-4 font-medium">
          {surveyType === 'nps' && 'באיזו מידה היית ממליץ לחבר?'}
          {surveyType === 'csat' && 'כמה אתה מרוצה מהשירות?'}
          {surveyType === 'ces' && 'כמה היה קל להשתמש?'}
        </p>

        <div className="flex justify-center gap-2 flex-wrap">
          {scores.map((num) => (
            <button
              key={num}
              onClick={() => setScore(num)}
              className={`
                w-12 h-12 rounded-lg font-bold text-lg transition-all
                ${score === num 
                  ? 'bg-blue-600 text-white scale-110 shadow-lg' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {num}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
          <span>בכלל לא</span>
          <span>מאוד</span>
        </div>
      </div>

      {/* Feedback (Optional) */}
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-2">
          רוצה לספר לנו עוד? (אופציונלי)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="כתוב כאן את המחשבות שלך..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!score || submitting}
        className={`
          w-full py-3 rounded-lg font-bold text-white transition-all
          ${score && !submitting
            ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            : 'bg-gray-300 cursor-not-allowed'
          }
        `}
      >
        {submitting ? 'שולח...' : 'שלח משוב'}
      </button>
    </div>
  );
}
