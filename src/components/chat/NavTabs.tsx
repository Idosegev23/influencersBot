'use client';

/**
 * Nav-tab icons — Figma node 323:890 spec:
 *   chat       → /icons/nav/comment.svg
 *   discover   → /icons/nav/screen-play.svg
 *   topics(שירותים)/services_provider → /icons/nav/bonus-alt.svg
 * Other tab types fall back to the legacy /icons/<name>.svg set.
 */
const LABEL_ICONS: Record<string, string> = {
  // Hebrew labels (existing accounts)
  'צ׳אט': 'nav/comment',
  'גלו': 'nav/screen-play',
  'ForYou': 'nav/screen-play',
  'שירותים': 'nav/bonus-alt',
  'טיפוח': 'tipuach',
  'לוקים': 'lookim',
  'מתכונים': 'matkonim',
  'סקירות': 'skirot',
  'המלצות': 'hamlazot',
  'טיפים': 'hamlazot',
  'מה חם': 'ham',
  'קופונים': 'coupons',
  'מבצעים': 'mivzaim',
  'דילים': 'mivzaim',
  'הטבות': 'mivzaim',
  'מוצרים': 'mozarim',
  'בעיה במוצר': 'baaya',
  'בעיה בהזמנה': 'baaya_motzar',
  // English labels (IMAI and future int'l accounts)
  'Chat': 'nav/comment',
  'Discover': 'nav/screen-play',
  'Platform': 'nav/bonus-alt',
  'Customers': 'mozarim',
  // "Play a demo" semantics — the screen-with-play-button icon. Only
  // appears for b2b_saas accounts (no clash with Discover, which uses
  // the same icon but never coexists with Demo in one nav).
  'Demo': 'nav/screen-play',
  'Features': 'nav/bonus-alt',
  'Products': 'mozarim',
  'Services': 'nav/bonus-alt',
  'Promos': 'coupons',
  'Offers': 'mivzaim',
  'Deals': 'mivzaim',
  'Perks': 'mivzaim',
  'Get support': 'baaya',
  'Reviews': 'skirot',
  'Tips & picks': 'hamlazot',
};

/* ── Icon mapping by tab id (fallback) — language-agnostic ── */
const TAB_ICONS: Record<string, string> = {
  chat: 'nav/comment',
  discover: 'nav/screen-play',
  topics: 'nav/bonus-alt',
  products: 'mozarim',
  content_feed: 'ham',
  coupons: 'coupons',
  support: 'baaya',
  platform: 'nav/bonus-alt',
  customers: 'mozarim',
  demo: 'nav/screen-play',
};

function getTabIconName(tab: TabItem): string {
  if (LABEL_ICONS[tab.label]) return LABEL_ICONS[tab.label];
  if (TAB_ICONS[tab.id]) return TAB_ICONS[tab.id];
  return 'chat';
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
          const iconName = getTabIconName(tab);
          // Cache-bust v=2: nav SVG files were deleted then restored.
          // Browsers that received a 404 have cached the negative
          // result under cache-control:immutable for a year. The query
          // string forces a fresh fetch.
          const iconUrl = `/icons/${iconName}.svg?v=2`;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-tab${isActive ? ' nav-tab--active' : ''}`}
              aria-selected={isActive}
              role="tab"
            >
              <span
                className="nav-tab-icon"
                style={{
                  WebkitMaskImage: `url(${iconUrl})`,
                  maskImage: `url(${iconUrl})`,
                }}
                aria-hidden
              />
              {isActive && <span className="nav-tab-label">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
