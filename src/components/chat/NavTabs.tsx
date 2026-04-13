'use client';

import type { LucideIcon } from 'lucide-react';
import {
  MessageCircle,
  Compass,
  Sparkles,
  ShoppingBag,
  Ticket,
  AlertCircle,
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
};

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
          const Icon = TAB_ICONS[tab.id] || MessageCircle;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-tab${isActive ? ' nav-tab--active' : ''}`}
              aria-selected={isActive}
              role="tab"
            >
              <Icon className="nav-tab-icon" />
              {isActive && <span className="nav-tab-label">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
