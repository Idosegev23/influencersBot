'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, Shirt, Sparkles, Dumbbell, Cpu, Plane, Baby, Heart, Home, Newspaper,
  Clock, ChevronLeft, Loader2, Star, UtensilsCrossed, Search,
  X, ExternalLink, MessageCircle, ShoppingBag, Tag, Flame, AlignCenter, ArrowLeft,
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
  onAskAbout: (question: string, chunkId?: string, hiddenContext?: string) => void;
  influencerName?: string;
  influencerAvatar?: string | null;
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
    askLabel: 'על המתכון',
    accentColor: '#883fe2',
    accentBg: '#f1e9fd',
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
  home: {
    icon: Home,
    subtitle: 'בית ועיצוב',
    askPrefix: 'ספרו לי על',
    askLabel: 'שאלו אותי על זה',
    accentColor: '#2e7d32',
    accentBg: '#e8f5e9',
    emptyText: 'אין עדיין תוכן',
    headerStyle: 'default',
  },
  media_news: {
    icon: Newspaper,
    subtitle: 'עדכונים חמים',
    askPrefix: 'ספרו לי על',
    askLabel: 'קראו עוד',
    accentColor: '#d32f2f',
    accentBg: '#ffebee',
    emptyText: 'אין עדיין עדכונים',
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

// ─── Recipe Detail Sheet — full-screen, sticky header (Figma 431:8662) ───

function parseRecipeText(fullText: string) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const ingredientHeaders = ['מרכיבים', 'רכיבים', 'מצרכים'];
  const stepHeaders = ['אופן הכנה', 'אופן ההכנה', 'הוראות הכנה', 'שלבי הכנה', 'הכנה'];
  const isIngredientHeader = (l: string) =>
    ingredientHeaders.some(h => l.startsWith(h) && l.length < h.length + 15);
  const isStepHeader = (l: string) =>
    stepHeaders.some(h => l.startsWith(h) && l.length < h.length + 15);

  const ingredients: string[] = [];
  const steps: string[] = [];
  let mode: 'none' | 'ingredients' | 'steps' = 'none';

  for (const line of lines) {
    if (isIngredientHeader(line)) { mode = 'ingredients'; continue; }
    if (isStepHeader(line)) { mode = 'steps'; continue; }
    const cleaned = line.replace(/^[-•·]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
    if (!cleaned) continue;
    if (mode === 'ingredients') ingredients.push(cleaned);
    else if (mode === 'steps') steps.push(cleaned);
  }
  return { ingredients, steps };
}

function RecipeSheet({
  item,
  config,
  onClose,
  onAsk,
  influencerName,
  influencerAvatar,
}: {
  item: ContentCard;
  config: typeof TYPE_CONFIG['food'];
  onClose: () => void;
  onAsk: (q: string, chunkId?: string) => void;
  influencerName?: string;
  influencerAvatar?: string | null;
}) {
  const { ingredients, steps } = parseRecipeText(item.fullText);
  const postUrl = item.sourceUrl || null;

  return (
    <motion.div
      initial={{ opacity: 0, x: '-30%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-30%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className="cf-recipe-sheet"
      dir="rtl"
    >
      {/* Sticky header */}
      <div className="cf-recipe-sheet__header">
        <button onClick={onClose} className="cf-recipe-sheet__back" aria-label="חזרה">
          <ArrowLeft className="w-7 h-7" />
        </button>
        <div className="cf-recipe-sheet__user">
          <div className="cf-recipe-sheet__user-text">
            <p className="cf-recipe-sheet__user-name">{influencerName || 'מתכונים'}</p>
            <p className="cf-recipe-sheet__user-subtitle">{config.subtitle}</p>
          </div>
          <div className="cf-recipe-sheet__avatar">
            {influencerAvatar ? (
              <img src={getProxiedImageUrl(influencerAvatar)} alt={influencerName || ''} />
            ) : (
              <div className="cf-recipe-sheet__avatar-fallback">
                <ChefHat className="w-5 h-5" />
              </div>
            )}
            <span className="cf-recipe-sheet__avatar-status" />
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="cf-recipe-sheet__scroll">
        <div className="cf-recipe-sheet__content">
          {item.imageUrl && (
            <div className="cf-recipe-sheet__img">
              <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} />
            </div>
          )}

          <div className="cf-recipe-sheet__intro">
            <h1 className="cf-recipe-sheet__title">{item.title}</h1>

            {(item.meta.items || item.meta.time || item.meta.difficulty || item.meta.servings) && (
              <div className="cf-recipe-sheet__chips">
                {item.meta.items && (
                  <span className="cf-pill cf-pill--purple">
                    {item.meta.items}
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                  </span>
                )}
                {item.meta.time && (
                  <span className="cf-pill cf-pill--purple">
                    {item.meta.time}
                    <Clock className="w-3.5 h-3.5" />
                  </span>
                )}
                {item.meta.difficulty && (
                  <span className="cf-pill cf-pill--purple">{item.meta.difficulty}</span>
                )}
                {item.meta.servings && (
                  <span className="cf-pill cf-pill--purple">{item.meta.servings}</span>
                )}
              </div>
            )}

            {item.description && (
              <p className="cf-recipe-sheet__desc">{item.description}</p>
            )}
          </div>

          {ingredients.length > 0 && (
            <section className="cf-recipe-sheet__section">
              <h2 className="cf-recipe-sheet__section-title">מרכיבים</h2>
              <ul className="cf-recipe-sheet__ingredients">
                {ingredients.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {steps.length > 0 && (
            <section className="cf-recipe-sheet__section">
              <h2 className="cf-recipe-sheet__section-title">אופן ההכנה</h2>
              <ol className="cf-recipe-sheet__steps">
                {steps.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </section>
          )}

          {/* fallback when parser found nothing */}
          {ingredients.length === 0 && steps.length === 0 && item.fullText && (
            <section className="cf-recipe-sheet__section">
              <p className="cf-recipe-sheet__fulltext">{item.fullText}</p>
            </section>
          )}

          <div className="cf-recipe-sheet__appetit">
            <span>בתאבון....</span>
            <UtensilsCrossed className="w-3.5 h-3.5" />
          </div>

          <div className="cf-recipe-sheet__actions">
            <button
              onClick={() => {
                onAsk(`${config.askPrefix} "${item.title}"`, item.id);
                onClose();
              }}
              className="cf-recipe-sheet__btn cf-recipe-sheet__btn--primary"
            >
              <MessageCircle className="w-4 h-4" />
              שאלו אותי על המתכון
            </button>
            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cf-recipe-sheet__btn cf-recipe-sheet__btn--secondary"
              >
                <ExternalLink className="w-4 h-4" />
                {item.shortcode ? 'צפו בפוסט' : 'למתכון המלא'}
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Recipe card — masonry grid, purple palette, meta pills, badge ───

function RecipeCard({ item, config, onOpen, isNew }: { item: ContentCard; config: typeof TYPE_CONFIG['food']; onOpen: (item: ContentCard) => void; isNew?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-recipe-card"
      onClick={() => onOpen(item)}
    >
      <div className="cf-recipe-card__inner">
        {isNew && (
          <span className="cf-recipe-card__badge">
            <Flame className="w-3.5 h-3.5" />
            חדש
          </span>
        )}
        <div className="cf-recipe-card__img-wrap">
          {item.imageUrl && (
            <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} loading="lazy" />
          )}
        </div>
        <div className="cf-recipe-card__text">
          <h3 className="cf-recipe-card__title">{item.title}</h3>
          {item.description && (
            <p className="cf-recipe-card__desc">{item.description}</p>
          )}
        </div>
        {(item.meta.time || item.meta.items) && (
          <div className="cf-recipe-card__pills">
            {item.meta.time && (
              <span className="cf-pill cf-pill--purple">
                {item.meta.time}
                <Clock className="w-3.5 h-3.5" />
              </span>
            )}
            {item.meta.items && (
              <span className="cf-pill cf-pill--purple">
                {item.meta.items}
                <UtensilsCrossed className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(item); }}
        className="cf-recipe-card__cta"
      >
        <AlignCenter className="w-3.5 h-3.5" />
        {config.askLabel}
      </button>
    </motion.div>
  );
}

// ─── Look card — tall image, dark gradient, brand name, editorial serif ───

function LookCard({ item, config, onAsk, index }: { item: ContentCard; config: typeof TYPE_CONFIG['fashion']; onAsk: (q: string, chunkId?: string, hiddenContext?: string) => void; index: number }) {
  const brandName = item.meta.brand || null;
  const size = item.meta.size || null;
  const isSponsored = !!item.meta.sponsored;
  const hasSource = !!item.sourceUrl;
  // Alternate tall/short for railroad-track effect
  const isTall = index % 3 !== 1;

  // Clean display message for chat + full content sent behind the scenes
  const askAboutLook = () => {
    const brandLabel = brandName || item.title;
    const displayMessage = `ספרי לי על הלוק הזה של ${brandLabel} 👗`;
    // Always build context — include item ID, brand, title, and transcription
    const contextParts: string[] = [];
    contextParts.push(`[מזהה לוק: ${item.id}]`);
    if (brandName) contextParts.push(`[מותג: ${brandName}]`);
    contextParts.push(`[כותרת: ${item.title}]`);
    if (item.fullText) {
      contextParts.push(item.fullText);
    } else if (item.description) {
      contextParts.push(item.description);
    }
    const hiddenContext = contextParts.join('\n');
    onAsk(displayMessage, item.id, hiddenContext);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`cf-look-card ${isTall ? 'cf-look-card--tall' : 'cf-look-card--short'}`}
      onClick={() => {
        if (hasSource) {
          window.open(item.sourceUrl!, '_blank');
        } else {
          askAboutLook();
        }
      }}
    >
      <div className="cf-look-card__img">
        {item.imageUrl ? (
          <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={brandName || item.title} loading="lazy" />
        ) : (
          <div className="cf-look-card__placeholder">
            <Shirt className="w-8 h-8" style={{ color: '#999' }} />
          </div>
        )}
        <div className="cf-look-card__overlay">
          {brandName && (
            <span className="cf-look-card__brand">
              <Tag className="w-3 h-3" />
              {brandName}
            </span>
          )}
          {isSponsored && (
            <span className="cf-look-card__sponsored">שיתוף פעולה</span>
          )}
          <div className="cf-look-card__bottom">
            {size && <span className="cf-look-card__size">{size}</span>}
            <button
              onClick={(e) => { e.stopPropagation(); askAboutLook(); }}
              className="cf-look-card__cta"
            >
              <ShoppingBag className="w-3 h-3" />
              {config.askLabel}
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Beauty card — square image, pink/mauve palette, metadata chips ───

function BeautyCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['beauty']; onAsk: (q: string, chunkId?: string) => void }) {
  // Extract beauty-specific metadata
  const steps = item.meta.steps || null;
  const skinType = item.meta.skin_type || item.meta.type || null;
  const metaLine = [steps, skinType].filter(Boolean).join(' • ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-beauty-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`, item.id)}
    >
      <div className="cf-beauty-card__img">
        {item.imageUrl ? (
          <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} loading="lazy" />
        ) : (
          <div className="cf-beauty-card__placeholder">
            <Sparkles className="w-8 h-8" style={{ color: '#805062' }} />
          </div>
        )}
      </div>
      <div className="cf-beauty-card__body">
        <h3 className="cf-beauty-card__title">{item.title}</h3>
        {metaLine && (
          <p className="cf-beauty-card__meta">{metaLine}</p>
        )}
        {item.description && (
          <p className="cf-beauty-card__desc">{item.description}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Beauty sub-tabs (category filter) ───
const BEAUTY_CATEGORIES = [
  { id: 'all', label: 'הכל' },
  { id: 'face', label: 'פנים' },
  { id: 'hair', label: 'שיער' },
  { id: 'body', label: 'גוף' },
  { id: 'makeup', label: 'איפור' },
];

// ─── Review card — tech, with stars ───

function ReviewCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['tech']; onAsk: (q: string, chunkId?: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-review-card"
    >
      {item.imageUrl && (
        <div className="cf-review-card__img">
          <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} loading="lazy" />
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
          onClick={() => onAsk(`${config.askPrefix} "${item.title}"`, item.id)}
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

function DestinationCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['travel']; onAsk: (q: string, chunkId?: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-destination-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`, item.id)}
    >
      <div className="cf-destination-card__img">
        {item.imageUrl ? (
          <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} loading="lazy" />
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

function GenericCard({ item, config, onAsk }: { item: ContentCard; config: typeof TYPE_CONFIG['other']; onAsk: (q: string, chunkId?: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-generic-card"
      onClick={() => onAsk(`${config.askPrefix} "${item.title}"`, item.id)}
    >
      {item.imageUrl && (
        <div className="cf-generic-card__thumb">
          <img src={getProxiedImageUrl(item.imageUrl, item.shortcode || undefined)} alt={item.title} loading="lazy" />
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

export default function ContentFeedTab({ username, influencerType, tabLabel, onAskAbout, influencerName, influencerAvatar }: ContentFeedTabProps) {
  const [items, setItems] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ContentCard | null>(null);
  const [beautyCategory, setBeautyCategory] = useState('all');

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

  // Detect "new" items (first 3 items assumed newest)
  const newItemIds = useMemo(() => new Set(items.slice(0, 3).map(i => i.id)), [items]);

  // Filter items by search query + beauty category
  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery) {
      result = result.filter(item =>
        item.title.includes(searchQuery) || item.description.includes(searchQuery)
      );
    }
    if (influencerType === 'beauty' && beautyCategory !== 'all') {
      const catMap: Record<string, string[]> = {
        face: ['פנים', 'סרום', 'קרם', 'ניקוי', 'face', 'serum', 'moisturizer'],
        hair: ['שיער', 'hair', 'שמפו', 'מסכה לשיער'],
        body: ['גוף', 'body', 'קרם גוף', 'פילינג'],
        makeup: ['איפור', 'makeup', 'שפתון', 'מסקרה', 'פאונדיישן', 'בסיס'],
      };
      const keywords = catMap[beautyCategory] || [];
      result = result.filter(item =>
        keywords.some(kw =>
          item.title.includes(kw) || item.description.includes(kw) ||
          (item.meta.category || '').includes(kw) || (item.topic || '').includes(kw)
        )
      );
    }
    return result;
  }, [items, searchQuery, influencerType, beautyCategory]);

  // Choose card component based on type
  const renderCard = (item: ContentCard, index: number) => {
    switch (influencerType) {
      case 'food':
        return <RecipeCard key={item.id} item={item} config={config} onOpen={openModal} isNew={newItemIds.has(item.id)} />;
      case 'fashion':
        return <LookCard key={item.id} item={item} config={config} onAsk={onAskAbout} index={index} />;
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
      : influencerType === 'beauty'
      ? 'cf-grid--beauty'
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

  // ── Type-specific header rendering ──
  const renderHeader = () => {
    if (influencerType === 'fashion') {
      return (
        <div className="cf-header cf-header--fashion">
          <h2 className="cf-header__title cf-header__title--serif">{tabLabel}</h2>
          <div className="cf-header__line" />
          <p className="cf-header__subtitle">{config.subtitle}</p>
        </div>
      );
    }
    if (influencerType === 'beauty') {
      return (
        <div className="cf-header cf-header--beauty">
          <div className="cf-header__glass">
            <div className="cf-header__icon" style={{ background: config.accentBg }}>
              <Icon className="w-5 h-5" style={{ color: config.accentColor }} />
            </div>
            <h2 className="cf-header__title">{tabLabel}</h2>
            <p className="cf-header__subtitle">{config.subtitle}</p>
          </div>
          {/* Category sub-tabs */}
          <div className="cf-beauty-tabs">
            {BEAUTY_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setBeautyCategory(cat.id)}
                className={`cf-beauty-tabs__btn ${beautyCategory === cat.id ? 'cf-beauty-tabs__btn--active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (influencerType === 'food') {
      return (
        <div className="cf-header cf-header--recipe">
          <h2 className="cf-header__title">{tabLabel}</h2>
          <p className="cf-header__subtitle">{config.subtitle}</p>
        </div>
      );
    }
    // Default header
    return (
      <div className="cf-header">
        <div className="cf-header__icon" style={{ background: config.accentBg }}>
          <Icon className="w-6 h-6" style={{ color: config.accentColor }} />
        </div>
        <h2 className="cf-header__title">{tabLabel}</h2>
        <p className="cf-header__subtitle">{config.subtitle}</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`cf-tab cf-tab--${influencerType} h-full overflow-y-auto pb-32`}
      dir="rtl"
    >
      <div className="px-4 py-5">
        <div className="max-w-[700px] mx-auto">
          {/* Header */}
          {renderHeader()}

          {/* Search */}
          {items.length > 5 && (
            <div className={`cf-search ${influencerType === 'food' ? 'cf-search--recipe' : ''}`}>
              <Search className="w-4 h-4 cf-search__icon" />
              <input
                type="text"
                placeholder={influencerType === 'food' ? 'חפשו מתכון...' : influencerType === 'beauty' ? 'חפשו מוצר או שגרה...' : 'חפשו תוכן...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="cf-search__input"
              />
            </div>
          )}

          {/* Content */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="cf-empty">{searchQuery || beautyCategory !== 'all' ? 'לא נמצאו תוצאות' : config.emptyText}</p>
            </div>
          ) : (
            <>
              <div className={`cf-grid ${gridClass}`}>
                <AnimatePresence>
                  {filteredItems.map((item, i) => renderCard(item, i))}
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

      {/* Detail sheet — portal to body */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedItem && (
            <RecipeSheet
              item={selectedItem}
              config={config}
              onClose={closeModal}
              onAsk={onAskAbout}
              influencerName={influencerName}
              influencerAvatar={influencerAvatar}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
