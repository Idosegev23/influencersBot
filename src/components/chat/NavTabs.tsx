'use client';

/* ── Icon mapping by label (primary — checked first) ── */
const LABEL_ICONS: Record<string, string> = {
  'טיפוח': 'tipuach',
  'לוקים': 'lookim',
  'מתכונים': 'matkonim',
  'שירותים': 'shirutim',
  'סקירות': 'skirot',
  'המלצות': 'hamlazot',
  'טיפים': 'hamlazot',
  'מה חם': 'ham',
  'קופונים': 'coupons',
  'מבצעים': 'mivzaim',
  'דילים': 'mivzaim',
  'הטבות': 'mivzaim',
  'מוצרים': 'mozarim',
  'גלו': 'galu',
  'צ׳אט': 'chat',
  'בעיה במוצר': 'baaya',
  'בעיה בהזמנה': 'baaya_motzar',
};

/* ── Icon mapping by tab id (fallback) ── */
const TAB_ICONS: Record<string, string> = {
  chat: 'chat',
  discover: 'galu',
  topics: 'ham',
  products: 'mozarim',
  content_feed: 'ham',
  coupons: 'coupons',
  support: 'baaya',
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
          const iconUrl = `/icons/${iconName}.svg`;

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
