'use client';

import type { LucideIcon } from 'lucide-react';
import {
  MessageCircle,
  Compass,
  Sparkles,
  ShoppingBag,
  Ticket,
  AlertCircle,
  Shirt,
  ChefHat,
  Briefcase,
  Droplets,
  Star,
  Tag,
  Eye,
} from 'lucide-react';

/* ── Icon mapping by tab id ── */
const TAB_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  discover: Compass,
  topics: Sparkles,
  products: ShoppingBag,
  content_feed: Sparkles,
  coupons: Ticket,
  support: AlertCircle,
  deals: Tag,
};

/* ── Icon mapping by label (fallback for topic-specific tabs) ── */
const LABEL_ICONS: Record<string, LucideIcon> = {
  'טיפוח': Droplets,
  'לוקים': Shirt,
  'מתכונים': ChefHat,
  'שירותים': Briefcase,
  'סקירות': Star,
  'מבצעים': Tag,
  'מוצרים': ShoppingBag,
  'קופונים': Ticket,
  'גלו': Compass,
  'צ׳אט': MessageCircle,
  'בעיה במוצר': AlertCircle,
  'בעיה בהזמנה': AlertCircle,
};

function getTabIcon(tab: TabItem): LucideIcon {
  // First try by tab id
  if (TAB_ICONS[tab.id]) return TAB_ICONS[tab.id];
  // Then try by label
  if (LABEL_ICONS[tab.label]) return LABEL_ICONS[tab.label];
  // Fallback
  return Eye;
}

export interface TabItem {
  id: string;
  label: string;
  type?: string;
  topic?: string;
}

interface NavTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function NavTabs({ tabs, activeTab, onTabChange }: NavTabsProps) {
  return (
    <div className="nav-tabs-bar">
      <div className="nav-tabs-inner">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = getTabIcon(tab);

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-tab${isActive ? ' nav-tab--active' : ''}`}
              aria-selected={isActive}
              role="tab"
            >
              <Icon className="nav-tab-icon" />
              <span className="nav-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
