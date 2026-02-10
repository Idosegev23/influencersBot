'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { EnhancedBrandCards, type BrandCardData } from './EnhancedBrandCards';
import { QuickActions, type QuickActionData } from './QuickActions';
import { InlineProgress, type ProgressData } from './InlineProgress';
import { InlineForm, type FormType } from './InlineForm';

// UI Directives interface from Decision Engine
export interface UIDirectives {
  tone?: 'casual' | 'professional' | 'empathetic' | 'friendly';
  responseLength?: 'short' | 'standard' | 'detailed';
  showCardList?: 'brands' | 'products' | 'content';
  showQuickActions?: string[];
  showProgress?: ProgressData;
  showForm?: FormType;
  showSupportModal?: boolean;
  layout?: 'default' | 'cards-first' | 'form-focus' | 'minimal';
  nextBestActions?: Array<{
    label: string;
    action: string;
    payload?: Record<string, unknown>;
    priority: number;
  }>;
}

export interface DirectiveRendererProps {
  directives: UIDirectives;
  brands?: BrandCardData[];
  onQuickAction: (action: string, payload?: Record<string, unknown>) => void;
  onBrandAction: (action: 'copy' | 'open' | 'support', brand: BrandCardData) => void;
  onFormSubmit: (type: FormType, value: string) => void;
  isLoading?: boolean;
}

export function DirectiveRenderer({
  directives,
  brands = [],
  onQuickAction,
  onBrandAction,
  onFormSubmit,
  isLoading = false,
}: DirectiveRendererProps) {
  const hasContent = directives.showCardList || 
                     directives.showQuickActions?.length || 
                     directives.showProgress ||
                     directives.showForm ||
                     directives.nextBestActions?.length;

  if (!hasContent) return null;

  // Build quick actions from directive
  const quickActions: QuickActionData[] = [];
  
  // Add showQuickActions
  if (directives.showQuickActions?.length) {
    directives.showQuickActions.forEach((label, i) => {
      quickActions.push({
        id: `quick-${i}`,
        label,
        action: 'quick_action',
        payload: { text: label },
        variant: i === 0 ? 'primary' : 'secondary',
      });
    });
  }

  // Add nextBestActions with higher priority
  if (directives.nextBestActions?.length) {
    directives.nextBestActions.forEach((nba, i) => {
      quickActions.push({
        id: `nba-${i}`,
        label: nba.label,
        action: nba.action,
        payload: nba.payload,
        variant: i === 0 ? 'primary' : 'ghost',
      });
    });
  }

  // Layout-based ordering
  const renderOrder = directives.layout === 'cards-first' 
    ? ['cards', 'progress', 'quickActions', 'form']
    : directives.layout === 'form-focus'
    ? ['progress', 'form', 'quickActions', 'cards']
    : ['progress', 'cards', 'quickActions', 'form'];

  const renderElement = (element: string) => {
    switch (element) {
      case 'cards':
        if (directives.showCardList === 'brands' && brands.length > 0) {
          return (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <EnhancedBrandCards
                brands={brands}
                onCopy={(brand) => onBrandAction('copy', brand)}
                onOpen={(brand) => onBrandAction('open', brand)}
                onSupport={(brand) => onBrandAction('support', brand)}
              />
            </motion.div>
          );
        }
        return null;

      case 'quickActions':
        if (quickActions.length > 0) {
          return (
            <motion.div
              key="quickActions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <QuickActions
                actions={quickActions}
                onAction={onQuickAction}
              />
            </motion.div>
          );
        }
        return null;

      case 'progress':
        if (directives.showProgress) {
          return (
            <motion.div
              key="progress"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <InlineProgress {...directives.showProgress} />
            </motion.div>
          );
        }
        return null;

      case 'form':
        if (directives.showForm) {
          return (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <InlineForm
                type={directives.showForm}
                onSubmit={(value) => onFormSubmit(directives.showForm!, value)}
                isLoading={isLoading}
              />
            </motion.div>
          );
        }
        return null;

      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="sync">
      <div className="space-y-3 mt-3">
        {renderOrder.map(renderElement).filter(Boolean)}
      </div>
    </AnimatePresence>
  );
}



