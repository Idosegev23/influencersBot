// ============================================
// Discovery Feature — Questions Service
// ============================================

import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { searchContentByQuery } from '@/lib/chatbot/hybrid-retrieval';
import type { DiscoveryQuestion, DiscoveryQuestionsData } from './types';

const openai = new OpenAI();

const MAX_QUESTION_LENGTH = 200;
const MAX_SUBMISSIONS_PER_DAY = 3;

/**
 * Get current week start date (Sunday)
 */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

/**
 * Get previous week start date
 */
function getPreviousWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day - 7;
  const prevSunday = new Date(now.setDate(diff));
  return prevSunday.toISOString().slice(0, 10);
}

/**
 * Format week range for display: "12-18 מרץ 2026"
 */
function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${start.getFullYear()}`;
}

/**
 * Get questions for the current week + previous week's answers
 */
export async function getQuestions(
  accountId: string,
  sessionHash: string
): Promise<DiscoveryQuestionsData> {
  const supabase = createClient();
  const weekStart = getWeekStart();
  const prevWeekStart = getPreviousWeekStart();

  const [currentRes, previousRes, submissionCountRes] = await Promise.all([
    // Current week open questions
    supabase
      .from('discovery_questions')
      .select('*')
      .eq('account_id', accountId)
      .eq('week_start', weekStart)
      .in('status', ['open', 'selected'])
      .order('vote_count', { ascending: false })
      .limit(20),

    // Previous week answered questions
    supabase
      .from('discovery_questions')
      .select('*')
      .eq('account_id', accountId)
      .eq('week_start', prevWeekStart)
      .eq('status', 'answered')
      .order('vote_count', { ascending: false })
      .limit(5),

    // Count submissions today by this session
    supabase
      .from('discovery_questions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('submitted_by', sessionHash)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const currentWeek: DiscoveryQuestion[] = (currentRes.data || []).map(q => ({
    id: q.id,
    questionText: q.question_text,
    voteCount: q.vote_count,
    hasVoted: (q.voters || []).includes(sessionHash),
    status: q.status,
    createdAt: q.created_at,
  }));

  const previousAnswers: DiscoveryQuestion[] = (previousRes.data || []).map(q => ({
    id: q.id,
    questionText: q.question_text,
    voteCount: q.vote_count,
    hasVoted: false,
    status: q.status,
    answerText: q.answer_text,
    answerGeneratedAt: q.answer_generated_at,
    createdAt: q.created_at,
  }));

  return {
    currentWeek,
    previousAnswers,
    canSubmitToday: (submissionCountRes.count ?? 0) < MAX_SUBMISSIONS_PER_DAY,
    weekLabel: formatWeekLabel(weekStart),
  };
}

/**
 * Submit a new question
 */
export async function submitQuestion(
  accountId: string,
  questionText: string,
  sessionHash: string
): Promise<{ success: boolean; error?: string; question?: DiscoveryQuestion }> {
  const text = questionText.trim();
  if (!text || text.length > MAX_QUESTION_LENGTH) {
    return { success: false, error: `השאלה חייבת להיות עד ${MAX_QUESTION_LENGTH} תווים` };
  }

  const supabase = createClient();
  const weekStart = getWeekStart();

  // Check daily submission limit
  const { count } = await supabase
    .from('discovery_questions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('submitted_by', sessionHash)
    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    return { success: false, error: 'הגעת למגבלת השאלות היומית. נסו שוב מחר!' };
  }

  const { data, error } = await supabase
    .from('discovery_questions')
    .insert({
      account_id: accountId,
      question_text: text,
      submitted_by: sessionHash,
      voters: [sessionHash],
      week_start: weekStart,
    })
    .select()
    .single();

  if (error) {
    console.error('[Discovery Questions] Submit failed:', error);
    return { success: false, error: 'שגיאה בשליחת השאלה' };
  }

  return {
    success: true,
    question: {
      id: data.id,
      questionText: data.question_text,
      voteCount: data.vote_count,
      hasVoted: true,
      status: data.status,
      createdAt: data.created_at,
    },
  };
}

/**
 * Vote on a question
 */
export async function voteQuestion(
  questionId: string,
  sessionHash: string
): Promise<{ success: boolean; error?: string; newVoteCount?: number }> {
  const supabase = createClient();

  // Get current question
  const { data: question, error: fetchError } = await supabase
    .from('discovery_questions')
    .select('id, vote_count, voters, status')
    .eq('id', questionId)
    .single();

  if (fetchError || !question) {
    return { success: false, error: 'שאלה לא נמצאה' };
  }

  if (question.status !== 'open') {
    return { success: false, error: 'לא ניתן להצביע על שאלה זו' };
  }

  const voters: string[] = question.voters || [];
  if (voters.includes(sessionHash)) {
    return { success: false, error: 'כבר הצבעת על שאלה זו' };
  }

  const { error: updateError } = await supabase
    .from('discovery_questions')
    .update({
      vote_count: question.vote_count + 1,
      voters: [...voters, sessionHash],
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId);

  if (updateError) {
    console.error('[Discovery Questions] Vote failed:', updateError);
    return { success: false, error: 'שגיאה בהצבעה' };
  }

  return { success: true, newVoteCount: question.vote_count + 1 };
}

/**
 * Generate answers for top 5 questions of the week (cron)
 */
export async function generateWeeklyAnswers(
  accountId: string,
  influencerName: string
): Promise<number> {
  const supabase = createClient();
  const weekStart = getWeekStart();

  // Get top 5 questions
  const { data: questions } = await supabase
    .from('discovery_questions')
    .select('*')
    .eq('account_id', accountId)
    .eq('week_start', weekStart)
    .eq('status', 'open')
    .order('vote_count', { ascending: false })
    .limit(5);

  if (!questions || questions.length === 0) return 0;

  let answered = 0;

  for (const q of questions) {
    try {
      // Find relevant content for the question
      const searchResults = await searchContentByQuery(accountId, q.question_text);
      const contentContext = searchResults
        .slice(0, 10)
        .map(r => `[${r.type}] ${r.title}`)
        .join('\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `אתה ${influencerName}. עוקב/ת שאל/ה את השאלה הבאה. ענה בסגנון אישי, חם ואותנטי, בהתבבסס על התוכן שלך. תשובה של 2-4 משפטים.`,
          },
          {
            role: 'user',
            content: `שאלה: ${q.question_text}\n\nתוכן רלוונטי:\n${contentContext}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });

      const answer = response.choices[0]?.message?.content;
      if (!answer) continue;

      await supabase
        .from('discovery_questions')
        .update({
          status: 'answered',
          answer_text: answer,
          answer_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', q.id);

      answered++;
    } catch (err) {
      console.error(`[Discovery Questions] Failed to answer question ${q.id}:`, err);
    }
  }

  // Archive remaining open questions for this week
  await supabase
    .from('discovery_questions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('week_start', weekStart)
    .eq('status', 'open');

  return answered;
}
