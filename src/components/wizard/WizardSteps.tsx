'use client';

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import type { WizardStep } from '@/types';

interface WizardStepsProps {
  currentStep: WizardStep;
  isLoading?: boolean;
}

const steps: { id: WizardStep; label: string }[] = [
  { id: 'url', label: 'הזנת URL' },
  { id: 'fetching', label: 'שליפה' },
  { id: 'analysis', label: 'ניתוח' },
  { id: 'review', label: 'אישור' },
  { id: 'theme', label: 'עיצוב' },
  { id: 'publish', label: 'פרסום' },
];

const stepOrder: WizardStep[] = ['url', 'fetching', 'analysis', 'review', 'theme', 'publish'];

export function WizardSteps({ currentStep, isLoading }: WizardStepsProps) {
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step.id === currentStep;
        const isPending = index > currentIndex;

        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all
              ${isCompleted ? 'bg-green-100 text-green-700' : ''}
              ${isCurrent ? 'bg-indigo-600 text-white' : ''}
              ${isPending ? 'bg-gray-100 text-gray-400' : ''}
            `}
          >
            {isCompleted && <Check className="w-3 h-3" />}
            {isCurrent && isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            {isCurrent && !isLoading && (
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            )}
            <span>{step.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}





