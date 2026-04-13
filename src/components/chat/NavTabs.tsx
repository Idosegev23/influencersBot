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
  CookingPot,
  BriefcaseBusiness,
  Droplets,
  BadgeCheck,
  Stars,
  Tag,
  Eye,
} from 'lucide-react';

/* ── Icon mapping by label (primary — checked first) ── */
const LABEL_ICONS: Record<string, LucideIcon> = {
  // Topic-specific labels
  'טיפוח': Droplets,
  'לוקים': Shirt,
  'מתכונים': CookingPot,
  'שירותים': BriefcaseBusiness,
  'סקירות': BadgeCheck,
  'המלצות': Stars,
  'טיפים': Stars,
  // Coupons/deals variants
  'קופונים': Ticket,
  'מבצעים': Tag,
  'דילים': Tag,
  'הטבות': Tag,
  // Standard tabs
  'מוצרים': ShoppingBag,
  'גלו': Compass,
  'צ׳אט': MessageCircle,
  'בעיה במוצר': AlertCircle,
  'בעיה בהזמנה': AlertCircle,
};

/* ── Icon mapping by tab id (fallback) ── */
const TAB_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  discover: Compass,
  topics: Sparkles,
  products: ShoppingBag,
  content_feed: Sparkles,
  coupons: Ticket,
  support: AlertCircle,
};

function getTabIcon(tab: TabItem): LucideIcon {
  // Label first — same tab id can have different labels per account
  if (LABEL_ICONS[tab.label]) return LABEL_ICONS[tab.label];
  // Then by tab id
  if (TAB_ICONS[tab.id]) return TAB_ICONS[tab.id];
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
              {isActive && <span className="nav-tab-label">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
