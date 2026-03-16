'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDiscovery } from '@/hooks/useDiscovery';
import { CategoryGrid } from './CategoryGrid';
import { DiscoveryList } from './DiscoveryList';
import { QuestionsView } from './QuestionsView';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryTabProps {
  username: string;
  influencerName: string;
  sessionId?: string;
  onAskInChat: (message: string) => void;
}

export default function DiscoveryTab({ username, influencerName, sessionId, onAskInChat }: DiscoveryTabProps) {
  const {
    categories,
    activeList,
    questionsData,
    loading,
    listLoading,
    questionsLoading,
    activeView,
    loadCategories,
    loadList,
    loadQuestions,
    submitNewQuestion,
    vote,
    goBack,
  } = useDiscovery({ username, sessionId });

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Handle "ask about this" — switch to chat and send message
  const handleAskAbout = (item: DiscoveryItem) => {
    const title = item.aiTitle || item.captionExcerpt;
    const truncated = title.length > 80 ? title.slice(0, 80) + '...' : title;
    const message = `ספרי לי עוד על: ${truncated}`;
    onAskInChat(message);
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#f4f5f7' }}>
      <AnimatePresence mode="wait">
        {activeView === 'grid' && (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <CategoryGrid
              categories={categories}
              loading={loading}
              onSelectCategory={loadList}
              onSelectQuestions={loadQuestions}
            />
          </motion.div>
        )}

        {activeView === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 overflow-y-auto"
          >
            <DiscoveryList
              data={activeList}
              loading={listLoading}
              onBack={goBack}
              onAskAbout={handleAskAbout}
            />
          </motion.div>
        )}

        {activeView === 'questions' && (
          <motion.div
            key="questions"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 overflow-y-auto"
          >
            <QuestionsView
              data={questionsData}
              loading={questionsLoading}
              onBack={goBack}
              onSubmit={submitNewQuestion}
              onVote={vote}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
