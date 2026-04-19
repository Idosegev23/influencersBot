'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  Users,
  Trash2,
  Settings2,
  ExternalLink,
  ListChecks,
  MoreHorizontal,
} from 'lucide-react';
import type { Influencer } from '@/types';
import { formatNumber } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';

import { PageHeader } from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type AccountFilter = 'all' | 'creator' | 'brand';
type SortKey = 'recent' | 'followers' | 'name';

export default function AccountsPage() {
  const router = useRouter();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [checklistProgress, setChecklistProgress] = useState<Record<string, { total: number; completed: number }>>({});

  useEffect(() => {
    (async () => {
      try {
        const authRes = await fetch('/api/admin');
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push('/admin');
          return;
        }
        const [accounts, progress] = await Promise.allSettled([
          fetch('/api/admin/accounts'),
          fetch('/api/admin/checklist/summary'),
        ]);
        if (accounts.status === 'fulfilled' && accounts.value.ok) {
          const data = await accounts.value.json();
          setInfluencers(data.influencers || []);
        }
        if (progress.status === 'fulfilled' && progress.value.ok) {
          const data = await progress.value.json();
          setChecklistProgress(data.progress || {});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = influencers.filter((i) => {
      if (filter === 'creator' && i.type !== 'creator') return false;
      if (filter === 'brand' && i.type !== 'brand') return false;
      if (q) {
        const hay = [i.display_name, i.username, i.category, i.full_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...base];
    if (sort === 'followers') sorted.sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0));
    else if (sort === 'name') sorted.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', 'he'));
    else sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return sorted;
  }, [influencers, filter, query, sort]);

  const totals = useMemo(() => {
    return {
      all: influencers.length,
      creator: influencers.filter((i) => i.type === 'creator').length,
      brand: influencers.filter((i) => i.type === 'brand').length,
    };
  }, [influencers]);

  const handleDelete = async (influencer: Influencer) => {
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק את @${influencer.username}?\n\n` +
        'פעולה זו תמחק: נתוני סריקה, פרסונה, מוצרים, קופונים ושיחות.\nהמחיקה היא לצמיתות.',
    );
    if (!confirmed) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/accounts/${influencer.id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await (await fetch('/api/admin/accounts')).json();
        setInfluencers(data.influencers || []);
      } else {
        const err = await res.json();
        alert(`שגיאה במחיקה: ${err.error || 'לא ידוע'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="ניהול"
        title="חשבונות"
        description="כל המשפיעני ם והמותגים שמחוברים למערכת. ניהול, צ׳קליסט, צפייה בצ׳אט."
        actions={
          <>
            <ButtonLink href="/admin/influencers" variant="outline" size="sm">
              <Users className="w-3.5 h-3.5" />
              תצוגה מפורטת
            </ButtonLink>
            <ButtonLink href="/admin/add" variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              חשבון חדש
            </ButtonLink>
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="ui-tabs">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
            הכל <Counter n={totals.all} />
          </FilterTab>
          <FilterTab active={filter === 'creator'} onClick={() => setFilter('creator')}>
            משפיענים <Counter n={totals.creator} />
          </FilterTab>
          <FilterTab active={filter === 'brand'} onClick={() => setFilter('brand')}>
            מותגים <Counter n={totals.brand} />
          </FilterTab>
        </div>

        <div className="flex-1" />

        <div className="relative md:w-72">
          <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[color:var(--ink-400)] pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש חשבון..."
            className="ps-8"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ui-input focus-ring w-auto min-w-[140px] pe-8"
          aria-label="מיון"
        >
          <option value="recent">הכי חדשים</option>
          <option value="followers">הכי פופולריים</option>
          <option value="name">לפי שם (א-ת)</option>
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-24 mb-2" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
              <Skeleton className="h-1.5 w-full mt-4" />
              <Skeleton className="h-8 w-full mt-4" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[color:var(--ink-100)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[color:var(--ink-500)]" />
            </div>
            <h3 className="text-[14px] font-semibold text-[color:var(--ink-800)] mb-1.5">לא נמצאו חשבונות</h3>
            <p className="text-[12.5px] text-[color:var(--ink-500)] mb-4">
              {query ? 'נסה חיפוש אחר או הסר את הפילטר.' : 'התחל על ידי הוספת חשבון ראשון.'}
            </p>
            <ButtonLink href="/admin/add" variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              הוספת חשבון
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((i) => (
            <AccountCard key={i.id} influencer={i} progress={checklistProgress[i.id]} onDelete={() => handleDelete(i)} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" data-active={active} onClick={onClick} className="ui-tab focus-ring">
      {children}
    </button>
  );
}

function Counter({ n }: { n: number }) {
  return (
    <span className="ms-1 inline-flex items-center justify-center min-w-[18px] px-1 h-[16px] rounded-[4px] bg-[color:var(--ink-100)] text-[10px] tabular-nums text-[color:var(--ink-600)] font-semibold">
      {n}
    </span>
  );
}

function AccountCard({
  influencer,
  progress,
  onDelete,
}: {
  influencer: Influencer;
  progress?: { total: number; completed: number };
  onDelete: () => void;
}) {
  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : null;
  const isDone = pct === 100;

  return (
    <Card hover className="group relative overflow-hidden">
      <div className="p-4 flex flex-col gap-3.5">
        {/* Head */}
        <div className="flex items-start gap-3 min-w-0">
          <Avatar
            src={influencer.profile_pic_url ? getProxiedImageUrl(influencer.profile_pic_url) : null}
            alt={influencer.display_name}
            fallback={influencer.display_name}
            size={44}
            rounded
            className="ring-1 ring-[color:var(--line)]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-[13.5px] font-semibold text-[color:var(--ink-900)] truncate">
                {influencer.display_name}
              </h3>
              {influencer.is_verified && (
                <span className="text-[color:var(--accent)] text-[11px]" aria-label="verified">
                  ●
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-[color:var(--ink-500)] truncate">@{influencer.username}</p>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {influencer.is_active ? (
                <Badge variant="success" dot>פעיל</Badge>
              ) : (
                <Badge variant="neutral">לא פעיל</Badge>
              )}
              {influencer.type === 'brand' && <Badge variant="accent">מותג</Badge>}
              <span className="text-[10.5px] text-[color:var(--ink-400)] ms-0.5 tabular-nums">
                {formatNumber(influencer.followers_count)} עוקבים
              </span>
            </div>
          </div>
          <button
            aria-label="עוד"
            className="ui-btn ui-btn-icon-sm ui-btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Checklist progress */}
        {pct != null && (
          <Link
            href={`/admin/influencers/${influencer.id}/checklist`}
            className="block group/cl"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-medium text-[color:var(--ink-500)] flex items-center gap-1 group-hover/cl:text-[color:var(--ink-700)]">
                <ListChecks className="w-3 h-3" strokeWidth={1.75} />
                צ׳קליסט
              </span>
              <span
                className={
                  'text-[10.5px] font-semibold tabular-nums ' +
                  (isDone ? 'text-[color:var(--success)]' : 'text-[color:var(--ink-700)]')
                }
              >
                {progress!.completed}/{progress!.total}
              </span>
            </div>
            <div className={'ui-progress ' + (isDone ? 'ui-progress-success' : '')}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </Link>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-3 border-t border-[color:var(--line)]">
          <Link
            href={`/admin/influencers/${influencer.id}`}
            className="ui-btn ui-btn-sm ui-btn-ghost focus-ring flex-1 justify-center"
          >
            <Settings2 className="w-3.5 h-3.5" />
            ניהול
          </Link>
          <a
            href={`/chat/${influencer.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-sm ui-btn-ghost focus-ring flex-1 justify-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            צפייה
          </a>
          <button
            onClick={onDelete}
            className="ui-btn ui-btn-icon-sm ui-btn-danger focus-ring"
            aria-label="מחק"
            title="מחק"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}
