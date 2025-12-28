'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, User, Image, FileText, Check } from 'lucide-react';

interface StepFetchingProps {
  progress: number;
  status: string;
}

const stages = [
  { id: 'profile', label: 'שולף פרופיל', icon: User },
  { id: 'posts', label: 'שולף פוסטים', icon: Image },
  { id: 'processing', label: 'מעבד נתונים', icon: FileText },
];

export function StepFetching({ progress, status }: StepFetchingProps) {
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    if (progress < 30) setCurrentStage(0);
    else if (progress < 70) setCurrentStage(1);
    else setCurrentStage(2);
  }, [progress]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto text-center"
    >
      <div className="mb-8">
        <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          שולף נתונים מאינסטגרם
        </h2>
        <p className="text-gray-600">{status || 'אנא המתינו...'}</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="progress-bar mb-2">
          <motion.div
            className="progress-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-sm text-gray-500">{progress}%</p>
      </div>

      {/* Stages */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStage;
          const isCurrent = index === currentStage;
          const Icon = stage.icon;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`
                flex items-center gap-3 p-4 rounded-xl transition-all
                ${isCompleted ? 'bg-green-50' : ''}
                ${isCurrent ? 'bg-indigo-50' : ''}
                ${!isCompleted && !isCurrent ? 'bg-gray-50 opacity-50' : ''}
              `}
            >
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  ${isCompleted ? 'bg-green-500' : ''}
                  ${isCurrent ? 'bg-indigo-500' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-gray-300' : ''}
                `}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 text-white" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Icon className="w-5 h-5 text-white" />
                )}
              </div>
              <span
                className={`
                  font-medium
                  ${isCompleted ? 'text-green-700' : ''}
                  ${isCurrent ? 'text-indigo-700' : ''}
                  ${!isCompleted && !isCurrent ? 'text-gray-500' : ''}
                `}
              >
                {stage.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}





