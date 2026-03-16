'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  DiscoveryCategoryAvailability,
  DiscoveryListData,
  DiscoveryQuestionsData,
  DiscoveryQuestion,
} from '@/lib/discovery/types';

interface UseDiscoveryOptions {
  username: string;
  sessionId?: string;
}

/**
 * Generate a simple session hash for question voting/submission
 */
function getSessionHash(sessionId?: string): string {
  if (sessionId) return sessionId;
  // Fallback: use a random ID stored in sessionStorage
  if (typeof window !== 'undefined') {
    const key = 'discovery_session_hash';
    let hash = sessionStorage.getItem(key);
    if (!hash) {
      hash = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, hash);
    }
    return hash;
  }
  return 'anonymous';
}

export function useDiscovery({ username, sessionId }: UseDiscoveryOptions) {
  const [categories, setCategories] = useState<DiscoveryCategoryAvailability[]>([]);
  const [activeList, setActiveList] = useState<DiscoveryListData | null>(null);
  const [questionsData, setQuestionsData] = useState<DiscoveryQuestionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [influencerName, setInfluencerName] = useState('');
  const [activeView, setActiveView] = useState<'grid' | 'list' | 'questions'>('grid');

  const sessionHash = useRef(getSessionHash(sessionId));

  /**
   * Load available categories
   */
  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/discovery/categories?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Failed to load categories');
      const data = await res.json();
      setCategories(data.categories || []);
      setInfluencerName(data.influencerName || '');
    } catch (err) {
      console.error('[useDiscovery] loadCategories failed:', err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [username]);

  /**
   * Load a specific category list
   */
  const loadList = useCallback(async (slug: string) => {
    setListLoading(true);
    setActiveView('list');
    try {
      const res = await fetch(
        `/api/discovery/list?username=${encodeURIComponent(username)}&slug=${encodeURIComponent(slug)}`
      );
      if (!res.ok) throw new Error('Failed to load list');
      const data: DiscoveryListData = await res.json();
      setActiveList(data);
    } catch (err) {
      console.error('[useDiscovery] loadList failed:', err);
      setActiveList(null);
    } finally {
      setListLoading(false);
    }
  }, [username]);

  /**
   * Load questions data
   */
  const loadQuestions = useCallback(async () => {
    setQuestionsLoading(true);
    setActiveView('questions');
    try {
      const res = await fetch(
        `/api/discovery/questions?username=${encodeURIComponent(username)}&sessionHash=${sessionHash.current}`
      );
      if (!res.ok) throw new Error('Failed to load questions');
      const data: DiscoveryQuestionsData = await res.json();
      setQuestionsData(data);
    } catch (err) {
      console.error('[useDiscovery] loadQuestions failed:', err);
    } finally {
      setQuestionsLoading(false);
    }
  }, [username]);

  /**
   * Submit a new question
   */
  const submitNewQuestion = useCallback(async (questionText: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/discovery/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          action: 'submit',
          questionText,
          sessionHash: sessionHash.current,
        }),
      });
      const data = await res.json();
      if (data.success && data.question) {
        // Add the new question to the list
        setQuestionsData(prev => prev ? {
          ...prev,
          currentWeek: [data.question, ...prev.currentWeek],
          canSubmitToday: prev.currentWeek.length + 1 < 3, // rough check
        } : prev);
      }
      return data;
    } catch {
      return { success: false, error: 'שגיאה בשליחה' };
    }
  }, [username]);

  /**
   * Vote on a question
   */
  const vote = useCallback(async (questionId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/discovery/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          action: 'vote',
          questionId,
          sessionHash: sessionHash.current,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update vote count locally
        setQuestionsData(prev => prev ? {
          ...prev,
          currentWeek: prev.currentWeek.map(q =>
            q.id === questionId
              ? { ...q, voteCount: data.newVoteCount ?? q.voteCount + 1, hasVoted: true }
              : q
          ),
        } : prev);
      }
      return data;
    } catch {
      return { success: false, error: 'שגיאה בהצבעה' };
    }
  }, [username]);

  /**
   * Navigate back to category grid
   */
  const goBack = useCallback(() => {
    setActiveView('grid');
    setActiveList(null);
    setQuestionsData(null);
  }, []);

  return {
    // State
    categories,
    activeList,
    questionsData,
    loading,
    listLoading,
    questionsLoading,
    influencerName,
    activeView,
    // Actions
    loadCategories,
    loadList,
    loadQuestions,
    submitNewQuestion,
    vote,
    goBack,
  };
}
