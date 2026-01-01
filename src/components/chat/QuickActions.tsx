'use client';

import { motion } from 'framer-motion';
import { 
  Copy, 
  ExternalLink, 
  HeadphonesIcon, 
  MessageCircle,
  Sparkles,
  Search,
  ShoppingBag,
  HelpCircle,
} from 'lucide-react';

export interface QuickActionData {
  id: string;
  label: string;
  action: string;
  payload?: Record<string, unknown>;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'warning';
}

interface QuickActionsProps {
  actions: QuickActionData[];
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  layout?: 'horizontal' | 'vertical' | 'wrap';
}

const actionIcons: Record<string, typeof Copy> = {
  copy_coupon: Copy,
  open_link: ExternalLink,
  start_support: HeadphonesIcon,
  ask: MessageCircle,
  suggest: Sparkles,
  search: Search,
  shop: ShoppingBag,
  help: HelpCircle,
};

const variantStyles: Record<string, string> = {
  primary: 'bg-[var(--color-primary)] text-white hover:opacity-90 border-transparent',
  secondary: 'bg-white text-gray-700 border-gray-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
  ghost: 'bg-transparent text-gray-600 border-transparent hover:bg-gray-100',
  success: 'bg-green-500 text-white hover:bg-green-600 border-transparent',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 border-transparent',
};

export function QuickActions({
  actions,
  onAction,
  layout = 'wrap',
}: QuickActionsProps) {
  if (!actions.length) return null;

  const layoutClasses = {
    horizontal: 'flex gap-2 overflow-x-auto pb-1',
    vertical: 'flex flex-col gap-2',
    wrap: 'flex flex-wrap gap-2',
  };

  return (
    <div className={layoutClasses[layout]}>
      {actions.map((action, index) => {
        const IconComponent = action.icon 
          ? actionIcons[action.icon] || MessageCircle 
          : null;
        const variant = action.variant || 'secondary';

        return (
          <motion.button
            key={action.id}
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03, duration: 0.15 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction(action.action, action.payload);
            }}
            className={`
              inline-flex items-center gap-1.5 px-3 py-2 
              rounded-full text-sm font-medium
              border transition-all duration-200
              whitespace-nowrap
              ${variantStyles[variant]}
            `}
          >
            {IconComponent && <IconComponent className="w-3.5 h-3.5" />}
            <span>{action.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// Preset quick actions for common scenarios
export const presetQuickActions = {
  couponOptions: [
    { id: 'copy', label: 'העתק קופון', action: 'copy_coupon', icon: 'copy_coupon', variant: 'primary' as const },
    { id: 'open', label: 'פתח אתר', action: 'open_link', icon: 'open_link', variant: 'secondary' as const },
    { id: 'problem', label: 'בעיה בקופון', action: 'start_support', icon: 'start_support', variant: 'ghost' as const },
  ],
  generalOptions: [
    { id: 'coupon', label: 'קופון', action: 'quick_action', payload: { text: 'יש לי קופון?' }, variant: 'secondary' as const },
    { id: 'support', label: 'בעיה בהזמנה', action: 'start_support', icon: 'start_support', variant: 'secondary' as const },
    { id: 'recommend', label: 'המלצה', action: 'quick_action', payload: { text: 'יש לך המלצה?' }, variant: 'secondary' as const },
    { id: 'other', label: 'אחר', action: 'quick_action', payload: { text: 'שאלה אחרת' }, variant: 'ghost' as const },
  ],
  clarifyOptions: [
    { id: 'coupon', label: 'קופון', action: 'quick_action', payload: { text: 'קופון' }, variant: 'primary' as const },
    { id: 'support', label: 'בעיה בהזמנה', action: 'quick_action', payload: { text: 'בעיה בהזמנה' }, variant: 'secondary' as const },
    { id: 'product', label: 'מוצר', action: 'quick_action', payload: { text: 'מוצר' }, variant: 'secondary' as const },
    { id: 'other', label: 'אחר', action: 'quick_action', payload: { text: 'אחר' }, variant: 'ghost' as const },
  ],
};

