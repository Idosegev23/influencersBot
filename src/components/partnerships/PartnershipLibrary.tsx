'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Partnership {
  id: string;
  brand_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  proposal_amount: number | null;
  contract_amount: number | null;
  created_at: string;
  whatsapp_phone?: string | null;
  brand_logo_url?: string | null;
  coupon_code?: string | null;
  category?: string | null;
  brief?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'ליד',
  proposal: 'הצעה',
  negotiation: 'משא ומתן',
  contract: 'חוזה',
  active: 'פעיל',
  in_progress: 'בעבודה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  lead: { bg: 'rgba(156,163,175,0.15)', text: 'var(--dash-text-2)', dot: '#9ca3af' },
  proposal: { bg: 'rgba(168,85,247,0.15)', text: '#a855f7', dot: '#a855f7' },
  negotiation: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', dot: '#f97316' },
  contract: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', dot: '#3b82f6' },
  active: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', dot: '#22c55e' },
  in_progress: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', dot: '#22c55e' },
  completed: { bg: 'rgba(16,185,129,0.15)', text: '#10b981', dot: '#10b981' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', dot: '#ef4444' },
};

export function PartnershipLibrary({
  partnerships,
  username,
}: {
  partnerships: Partnership[];
  username: string;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'brand'>('date');

  let filtered = partnerships.filter((p) => {
    const matchesSearch =
      p.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.brief?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'amount':
        return (b.contract_amount || b.proposal_amount || 0) - (a.contract_amount || a.proposal_amount || 0);
      case 'brand':
        return a.brand_name.localeCompare(b.brand_name, 'he');
      default:
        return 0;
    }
  });

  const statuses = Array.from(new Set(partnerships.map(p => p.status)));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dash-text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="חיפוש מותג..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 rounded-xl text-sm text-right focus:outline-none"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
              color: 'var(--dash-text)',
            }}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', ...statuses].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: statusFilter === s ? 'var(--color-primary)' : 'var(--dash-surface)',
                color: statusFilter === s ? '#fff' : 'var(--dash-text-2)',
                border: `1px solid ${statusFilter === s ? 'var(--color-primary)' : 'var(--dash-border)'}`,
              }}
            >
              {s === 'all' ? 'הכל' : STATUS_LABELS[s] || s}
              {s !== 'all' && (
                <span className="mr-1 opacity-60">
                  ({partnerships.filter(p => p.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2.5 rounded-xl text-xs text-right"
          style={{
            background: 'var(--dash-surface)',
            border: '1px solid var(--dash-border)',
            color: 'var(--dash-text-2)',
          }}
        >
          <option value="date">לפי תאריך</option>
          <option value="amount">לפי סכום</option>
          <option value="brand">לפי מותג</option>
        </select>
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-border)' }}>
          <p style={{ color: 'var(--dash-text-3)' }}>לא נמצאו שת״פים</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const style = STATUS_STYLES[p.status] || STATUS_STYLES.lead;
            const amount = p.contract_amount || p.proposal_amount || 0;

            return (
              <button
                key={p.id}
                onClick={() => router.push(`/influencer/${username}/partnerships/${p.id}`)}
                className="rounded-2xl p-5 text-right transition-all hover:scale-[1.01] hover:shadow-lg"
                style={{
                  background: 'var(--dash-surface)',
                  border: '1px solid var(--dash-border)',
                }}
              >
                {/* Top: Logo + Name + Status */}
                <div className="flex items-start gap-3 mb-3">
                  {p.brand_logo_url ? (
                    <img
                      src={p.brand_logo_url}
                      alt={p.brand_name}
                      className="w-12 h-12 rounded-xl object-contain flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.05)', padding: '4px' }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
                      style={{ background: style.bg, color: style.text }}
                    >
                      {p.brand_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate" style={{ color: 'var(--dash-text)' }}>
                      {p.brand_name}
                    </h3>
                    {p.category && (
                      <p className="text-xs truncate" style={{ color: 'var(--dash-text-3)' }}>
                        {p.category}
                      </p>
                    )}
                  </div>
                  <span
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0"
                    style={{ background: style.bg, color: style.text }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
                    {STATUS_LABELS[p.status] || p.status}
                  </span>
                </div>

                {/* Brief */}
                {p.brief && (
                  <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--dash-text-3)' }}>
                    {p.brief}
                  </p>
                )}

                {/* Bottom: Details */}
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--dash-border)' }}>
                  <div className="flex items-center gap-3">
                    {amount > 0 && (
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                        ₪{amount.toLocaleString('he-IL')}
                      </span>
                    )}
                    {p.coupon_code && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                      >
                        {p.coupon_code}
                      </span>
                    )}
                  </div>
                  {p.start_date && (
                    <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>
                      {new Date(p.start_date).toLocaleDateString('he-IL', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
