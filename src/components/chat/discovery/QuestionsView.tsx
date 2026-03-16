'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Send, ThumbsUp, MessageSquare, CheckCircle } from 'lucide-react';
import type { DiscoveryQuestionsData, DiscoveryQuestion } from '@/lib/discovery/types';

interface QuestionsViewProps {
  data: DiscoveryQuestionsData | null;
  loading: boolean;
  onBack: () => void;
  onSubmit: (text: string) => Promise<{ success: boolean; error?: string }>;
  onVote: (questionId: string) => Promise<{ success: boolean; error?: string }>;
}

export function QuestionsView({ data, loading, onBack, onSubmit, onVote }: QuestionsViewProps) {
  const [newQuestion, setNewQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!newQuestion.trim() || submitting) return;
    setSubmitting(true);
    setSubmitMessage(null);

    const result = await onSubmit(newQuestion.trim());
    if (result.success) {
      setNewQuestion('');
      setSubmitMessage({ text: 'השאלה נשלחה!', type: 'success' });
    } else {
      setSubmitMessage({ text: result.error || 'שגיאה', type: 'error' });
    }
    setSubmitting(false);
    setTimeout(() => setSubmitMessage(null), 3000);
  };

  const handleVote = async (questionId: string) => {
    setVotingId(questionId);
    await onVote(questionId);
    setVotingId(null);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f4f5f7' }}>
            <ChevronRight className="w-5 h-5" style={{ color: '#676767' }} />
          </button>
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-[20px] mb-2.5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="overflow-y-auto pb-32"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-4 pb-2">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          style={{ backgroundColor: '#f4f5f7' }}
        >
          <ChevronRight className="w-5 h-5" style={{ color: '#676767' }} />
        </button>
        <div className="flex-1">
          <h2 className="text-[20px] font-bold" style={{ color: '#0c1013' }}>
            שאלות שתמיד רציתם לשאול
          </h2>
          <p className="text-[13px]" style={{ color: '#676767' }}>
            5 השאלות הכי פופולריות יקבלו תשובה בשבוע הבא!
          </p>
        </div>
      </div>

      {/* Previous week answers */}
      {data && data.previousAnswers.length > 0 && (
        <div className="px-4 mb-4">
          <h3 className="text-[14px] font-bold mb-2" style={{ color: '#6C5CE7' }}>
            תשובות מהשבוע שעבר
          </h3>
          <div className="space-y-2.5">
            {data.previousAnswers.map((q) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-[20px] p-3.5"
                style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
              >
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#6C5CE7' }} />
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: '#0c1013' }}>
                      {q.questionText}
                    </p>
                    {q.answerText && (
                      <p className="text-[13px] mt-1 leading-relaxed" style={{ color: '#676767' }}>
                        {q.answerText}
                      </p>
                    )}
                    <span className="text-[11px]" style={{ color: '#999' }}>
                      {q.voteCount} הצביעו על שאלה זו
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Submit new question */}
      <div className="px-4 mb-5">
        <h3 className="text-[14px] font-bold mb-2" style={{ color: '#0c1013' }}>
          שאלו שאלה חדשה
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="מה תמיד רציתם לדעת?"
            className="flex-1 rounded-[60px] px-5 py-3 text-[14px] outline-none focus:ring-2 focus:ring-purple-200 transition-all"
            style={{ border: '1px solid #e5e5ea', direction: 'rtl', backgroundColor: '#ffffff' }}
            disabled={submitting || (data && !data.canSubmitToday)}
          />
          <button
            onClick={handleSubmit}
            disabled={!newQuestion.trim() || submitting}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
            style={{ backgroundColor: '#0c1013' }}
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        {!data?.canSubmitToday && (
          <p className="text-[11px] mt-1.5" style={{ color: '#999' }}>
            הגעתם למגבלה היומית. נסו שוב מחר!
          </p>
        )}
        <p className="text-[11px] mt-1" style={{ color: '#bbb' }}>
          {newQuestion.length}/200
        </p>
        <AnimatePresence>
          {submitMessage && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[12px] mt-1"
              style={{ color: submitMessage.type === 'success' ? '#10b981' : '#ef4444' }}
            >
              {submitMessage.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Current week questions */}
      {data && data.currentWeek.length > 0 && (
        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[14px] font-bold" style={{ color: '#0c1013' }}>
              השאלות של השבוע
            </h3>
            {data.weekLabel && (
              <span className="text-[11px]" style={{ color: '#999' }}>{data.weekLabel}</span>
            )}
          </div>
          <div className="space-y-2.5">
            {data.currentWeek.map((q, i) => (
              <QuestionItem
                key={q.id}
                question={q}
                index={i}
                onVote={handleVote}
                voting={votingId === q.id}
              />
            ))}
          </div>
        </div>
      )}

      {data && data.currentWeek.length === 0 && (
        <div className="px-4 pb-6 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-2" style={{ color: '#ccc' }} />
          <p className="text-[14px]" style={{ color: '#999' }}>
            עדיין אין שאלות השבוע. תהיו הראשונים!
          </p>
        </div>
      )}
    </motion.div>
  );
}

function QuestionItem({
  question,
  index,
  onVote,
  voting,
}: {
  question: DiscoveryQuestion;
  index: number;
  onVote: (id: string) => void;
  voting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 rounded-[20px] p-3.5"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
    >
      {/* Vote button */}
      <button
        onClick={() => !question.hasVoted && onVote(question.id)}
        disabled={question.hasVoted || voting}
        className="flex flex-col items-center gap-0.5 flex-shrink-0 transition-all"
        style={{ opacity: question.hasVoted ? 0.6 : 1 }}
      >
        <ThumbsUp
          className="w-5 h-5 transition-colors"
          style={{ color: question.hasVoted ? '#6C5CE7' : '#999' }}
          fill={question.hasVoted ? '#6C5CE7' : 'none'}
        />
        <span className="text-[11px] font-bold" style={{ color: question.hasVoted ? '#6C5CE7' : '#999' }}>
          {question.voteCount}
        </span>
      </button>

      {/* Question text */}
      <p className="flex-1 text-[14px] leading-tight" style={{ color: '#0c1013' }} dir="rtl">
        {question.questionText}
      </p>
    </motion.div>
  );
}
