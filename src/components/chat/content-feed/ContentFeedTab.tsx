'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, Shirt, Sparkles, Dumbbell, Cpu, Plane, Baby, Heart,
  Clock, ChevronLeft, Loader2, Star, UtensilsCrossed, Search,
  X, ExternalLink, MessageCircle,
} from 'lucide-react';
import type { InfluencerType } from '@/types';
import { getProxiedImageUrl } from '@/lib/image-utils';

interface ContentCard {
  id: string;
  title: string;
  description: string;
  fullText: string;
  imageUrl: string | null;
  meta: Record<string, string>;
  entityType: string;
  topic: string;
  shortcode: string | null;
  sourceUrl: string | null;
}

interface ContentFeedTabProps {
  username: string;
  influencerType: InfluencerType;
  tabLabel: string;
  onAskAbout: (question: string) => void;
}

// ─── Type-specific config ───

const TYPE_CONFIG: Record<string, {
  icon: typeof ChefHat;
  subtitle: string;
  askPrefix: string;
  askLabel: string;
  accentColor: string;
  accentBg: string;
  emptyText: string;
  headerStyle: 'warm' | 'editorial' | 'pastel' | 'default';
}> = {
  food: {
    icon: ChefHat,
    subtitle: 'המתכונים והטיפים',
    askPrefix: 'ספרי לי על המתכון',
    askLabel: 'שאלו אותי על המתכון',
    accentColor: '#6d4ea3',
    accentBg: '#f3eefc',
    emptyText: 'אין עדיין מתכונים',
    headerStyle: 'warm',
  },
  beauty: {
    icon: Sparkles,
    subtitle: 'שגרות ומוצרים',
    askPrefix: 'ספרי לי על',
    askLabel: 'קראו עוד',
    accentColor: '#7e4a8a',
    accentBg: '#fce4f0',
    emptyText: 'אין עדיין תוכן טיפוח',
    headerStyle: 'pastel',
  },
  fashion: {
    icon: Shirt,
    subtitle: 'לוקים וסטיילינג',
    askPrefix: 'ספרי לי על הלוק',
    askLabel: 'איפה קונים?',
    accentColor: '#1a1a1a',
    accentBg: '#f5f5f5',
    emptyText: 'אין עדיין לוקים',
    headerStyle: 'editorial',
  },
  fitness: {
    icon: Dumbbell,
    subtitle: 'אימונים ותזונה',
    askPrefix: 'ספרי לי על האימון',
    askLabel: 'שאלו אותי על זה',
    accentColor: '#198754',
    accentBg: '#e6f5ed',
    emptyText: 'אין עדיין אימונים',
    headerStyle: 'default',
  },
  tech: {
    icon: Cpu,
    subtitle: 'סקירות והמלצות',
    askPrefix: 'ספרי לי על',
    askLabel: 'קראו את הסקירה',
    accentColor: '#0d6efd',
    accentBg: '#e6f0ff',
    emptyText: 'אין עדיין סקירות',
    headerStyle: 'default',
  },
  travel: {
    icon: Plane,
    subtitle: 'יעדים וטיולים',
    askPrefix: 'ספרי לי על',
    askLabel: 'גלו עוד',
    accentColor: '#0dcaf0',
    accentBg: '#e6f9fc',
    emptyText: 'אין עדיין יעדים',
    headerStyle: 'default',
  },
  parenting: {
    icon: Baby,
    subtitle: 'טיפים והמלצות',
    askPrefix: 'ספרי לי על',
    askLabel: 'שאלו אותי על זה',
    accentColor: '#fd7e14',
    accentBg: '#fff4e6',
    emptyText: 'אין עדיין טיפים',
    headerStyle: 'default',
  },
  lifestyle: {
    icon: Heart,
    subtitle: 'טיפים והמלצות',
    askPrefix: 'ספרי לי על',
    askLabel: 'שאלו אותי על זה',
    accentColor: '#883fe2',
    accentBg: '#f1e9fd',
    emptyText: 'אין עדיין תוכן',
    headerStyle: 'default',
  },
  other: {
    icon: Heart,
    subtitle: 'תוכן',
    askPrefix: 'ספרי לי על',
    askLabel: 'שאלו אותי על זה',
    accentColor: '#883fe2',
    accentBg: '#f1e9fd',
    emptyText: 'אין עדיין תוכן',
    headerStyle: 'default',
  },
};

// ─── Recipe Detail Modal ───

function RecipeModal({
  item,
  config,
  onClose,
  onAsk,
}: {
  item: ContentCard;
  config: typeof TYPE_CONFIG['food'];
  onClose: () => void;
  onAsk: (q: string) => void;
}) {
  // Split content into sections (ingredients, instructions, etc.)
  const lines = item.fullText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Detect section headers for styling
  const sectionHeaders = ['מרכיבים', 'אופן הכנה', 'הוראות הכנה', 'שלבי הכנה'];
  const isSectionHeader = (line: string) =>
    sectionHeaders.some(h => line.startsWith(h) && line.length < h.length + 15);
  const isIngredient = (line: string) =>
    line.startsWith('-') || line.startsWith('•') || /^\d+\/?\d*\s*(כוס|כף|כפית|גרם|מ"ל|יח'|ק"ג)/.test(line);
  const isStep = (line: string) =>
    /^\d+[\.\)]?\s/.test(line);

  const postUrl = item.sourceUrl || null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="cf-modal-backdrop"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="cf-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button onClick={onClose} className="cf-modal__close">
          <X className="w-5 h-5" />
        </button>

        {/* Image */}
        {item.imageUrl && (
          <div className="cf-modal__img">
            <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} />
          </div>
        )}

        {/* Content */}
        <div className="cf-modal__content">
          <h2 className="cf-modal__title">{item.title}</h2>

          {/* Meta pills */}
          {Object.keys(item.meta).length > 0 && (
            <div className="cf-modal__pills">
              {item.meta.time && (
                <span className="cf-pill">
                  <Clock className="w-3.5 h-3.5" /> {item.meta.time}
                </span>
              )}
              {item.meta.items && (
                <span className="cf-pill">
                  <UtensilsCrossed className="w-3.5 h-3.5" /> {item.meta.items}
                </span>
              )}
              {item.meta.servings && (
                <span className="cf-pill">{item.meta.servings}</span>
              )}
              {item.meta.difficulty && (
                <span className="cf-pill">{item.meta.difficulty}</span>
              )}
            </div>
          )}

          {/* Full text — formatted with section headers */}
          <div className="cf-modal__text">
            {lines.map((line, i) => {
              if (isSectionHeader(line)) {
                return <h3 key={i} className="cf-modal__section">{line}</h3>;
              }
              if (isIngredient(line)) {
                return <p key={i} className="cf-modal__ingredient">{line}</p>;
              }
              if (isStep(line)) {
                return <p key={i} className="cf-modal__step">{line}</p>;
              }
              return <p key={i}>{line}</p>;
            })}
          </div>

          {/* CTAs */}
          <div className="cf-modal__actions">
            <button
              onClick={() => {
                onAsk(`${config.askPrefix} "${item.title}"`);
                onClose();
              }}
              className="cf-modal__btn cf-modal__btn--primary"
              style={{ background: config.accentColor }}
            >
              <MessageCircle className="w-4 h-4" />
              שאלו אותי על זה
            </button>

            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cf-modal__btn cf-modal__btn--secondary"
              >
                <ExternalLink className="w-4 h-4" />
                {item.shortcode ? 'צפו בפוסט' : 'למתכון המלא'}
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Recipe card — masonry grid, meta pills, warm palette ───

function RecipeCard({ item, config, onAsk, onOpen }: { item: ContentCard; config: typeof TYPE_CONFIG['food']; onAsk: (q: string) => void; onOpen: (item: ContentCard) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-recipe-card"
      onClick={() => onOpen(item)}
    >
      {item.imageUrl && (
        <div className="cf-recipe-card__img">
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        </div>
      )}
      <div className="cf-recipe-card__body">
        <h3 className="cf-recipe-card__title">{item.title}</h3>
        {Object.keys(item.meta).length > 0 && (
          <div className="cf-recipe-card__pills">
            {item.meta.time && (
              <span className="cf-pill">
                <Clock className="w-3 h-3" /> {item.meta.time}
              </span>
            )}
            {item.meta.items && (
              <span className="cf-pill">
                <UtensilsCrossed className="w-3 h-3" /> {item.meta.items}
              </span>
            )}
          </div>
        )}
        {item.description && (
          <p className="cf-recipe-card__desc">{item.description}</p>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAsk(`${config.askPrefix} "${item.title}"`); }}
          className="cf-card-cta"
          style={{ color: config.accentColor }}
        >
          {config.askLabel}
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Look card — tall image, overlay, editorial serif ───

function LookCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['fashion']; onAsk: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-look-card"
    >
      <div className="cf-look-card__img">
        {item.imageUrl ? (
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        ) : (
          <div className="cf-look-card__placeholder">
            <Shirt className="w-8 h-8" style={{ color: '#999' }} />
          </div>
        )}
        <div className="cf-look-card__overlay">
          <h3 className="cf-look-card__title">{item.title}</h3>
          <button
            onClick={(e) => { e.stopPropagation(); onAsk(`${config.askPrefix} "${item.title}"`); }}
            className="cf-look-card__cta"
          >
            {config.askLabel}
            <ChevronLeft className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Beauty card — full-width horizontal, pastel pink/purple, immersive ───

function BeautyCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['beauty']; onAsk: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-beauty-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`)}
    >
      {item.imageUrl && (
        <div className="cf-beauty-card__img">
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        </div>
      )}
      <div className="cf-beauty-card__body">
        <h3 className="cf-beauty-card__title">{item.title}</h3>
        {item.description && (
          <p className="cf-beauty-card__desc">{item.description}</p>
        )}
        {item.meta.steps && (
          <span className="cf-pill cf-pill--pink">
            {item.meta.steps}
          </span>
        )}
      </div>
      <ChevronLeft className="w-4 h-4 flex-shrink-0 cf-beauty-card__arrow" />
    </motion.div>
  );
}

// ─── Review card — tech, with stars ───

function ReviewCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['tech']; onAsk: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-review-card"
    >
      {item.imageUrl && (
        <div className="cf-review-card__img">
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        </div>
      )}
      <div className="cf-review-card__body">
        <h3 className="cf-review-card__title">{item.title}</h3>
        <div className="cf-review-card__stars">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} className="w-3.5 h-3.5" style={{ color: i <= 4 ? '#fbbf24' : '#e5e7eb' }} fill={i <= 4 ? '#fbbf24' : 'none'} />
          ))}
        </div>
        {item.description && (
          <p className="cf-review-card__desc">{item.description}</p>
        )}
        <button
          onClick={() => onAsk(`${config.askPrefix} "${item.title}"`)}
          className="cf-card-cta"
          style={{ color: config.accentColor }}
        >
          {config.askLabel}
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Destination card — wide image with overlay for travel ───

function DestinationCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['travel']; onAsk: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-destination-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`)}
    >
      <div className="cf-destination-card__img">
        {item.imageUrl ? (
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        ) : (
          <div className="cf-destination-card__placeholder" style={{ background: config.accentBg }}>
            <Plane className="w-8 h-8" style={{ color: config.accentColor }} />
          </div>
        )}
        <div className="cf-destination-card__overlay">
          <h3>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Generic card — list style ───

function GenericCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['other']; onAsk: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-generic-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`)}
    >
      {item.imageUrl && (
        <div className="cf-generic-card__thumb">
          <img src={getProxiedImageUrl(item.imageUrl)} alt={item.title} loading="lazy" />
        </div>
      )}
      <div className="cf-generic-card__info">
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
      </div>
      <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#ccc' }} />
    </motion.div>
  );
}

// ─── Main Component ───

export default function ContentFeedTab({ username, influencerType, tabLabel, onAskAbout }: ContentFeedTabProps) {
  const [items, setItems] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ContentCard | null>(null);

  const config = TYPE_CONFIG[influencerType] || TYPE_CONFIG.other;
  const Icon = config.icon;

  const openModal = useCallback((item: ContentCard) => {
    setSelectedItem(item);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedItem(null);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/content-feed?username=${encodeURIComponent(username)}&limit=20`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.items) {
          setItems(data.items);
          setHasMore(data.hasMore || false);
          setOffset(20);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/content-feed?username=${encodeURIComponent(username)}&limit=20&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.items) {
          setItems(prev => [...prev, ...data.items]);
          setHasMore(data.hasMore || false);
          setOffset(prev => prev + 20);
        }
      }
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  // Filter items by search query
  const filteredItems = searchQuery
    ? items.filter(item =>
        item.title.includes(searchQuery) ||
        item.description.includes(searchQuery)
      )
    : items;

  // Choose card component based on type
  const renderCard = (item: ContentCard) => {
    switch (influencerType) {
      case 'food':
        return <RecipeCard key={item.id} item={item} config={config} onAsk={onAskAbout} onOpen={openModal} />;
      case 'fashion':
        return <LookCard key={item.id} item={item} config={config} onAsk={onAskAbout} />;
      case 'beauty':
        return <BeautyCard key={item.id} item={item} config={config} onAsk={onAskAbout} />;
      case 'tech':
        return <ReviewCard key={item.id} item={item} config={config} onAsk={onAskAbout} />;
      case 'travel':
        return <DestinationCard key={item.id} item={item} config={config} onAsk={onAskAbout} />;
      default:
        return <GenericCard key={item.id} item={item} config={config} onAsk={onAskAbout} />;
    }
  };

  // Grid layout per type
  const gridClass =
    influencerType === 'food' || influencerType === 'fashion' || influencerType === 'tech'
      ? 'cf-grid--masonry'
      : influencerType === 'travel'
      ? 'cf-grid--wide'
      : 'cf-grid--list';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: config.accentColor }} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`cf-tab cf-tab--${config.headerStyle} h-full overflow-y-auto pb-32`}
      dir="rtl"
    >
      <div className="px-4 py-5">
        <div className="max-w-[700px] mx-auto">
          {/* Header */}
          <div className="cf-header">
            <div className="cf-header__icon" style={{ background: config.accentBg }}>
              <Icon className="w-6 h-6" style={{ color: config.accentColor }} />
            </div>
            <h2 className="cf-header__title">{tabLabel}</h2>
            <p className="cf-header__subtitle">{config.subtitle}</p>
          </div>

          {/* Search */}
          {items.length > 5 && (
            <div className="cf-search">
              <Search className="w-4 h-4 cf-search__icon" />
              <input
                type="text"
                placeholder="חפשו תוכן..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="cf-search__input"
              />
            </div>
          )}

          {/* Content */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="cf-empty">{searchQuery ? 'לא נמצאו תוצאות' : config.emptyText}</p>
            </div>
          ) : (
            <>
              <div className={`cf-grid ${gridClass}`}>
                <AnimatePresence>
                  {filteredItems.map(item => renderCard(item))}
                </AnimatePresence>
              </div>

              {hasMore && !searchQuery && (
                <div className="text-center mt-6">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="cf-load-more"
                    style={{ color: config.accentColor, borderColor: config.accentColor + '40' }}
                  >
                    {loadingMore ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'עוד תוכן'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recipe detail modal — portal to body to escape stacking context */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedItem && (
            <RecipeModal
              item={selectedItem}
              config={config}
              onClose={closeModal}
              onAsk={onAskAbout}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
