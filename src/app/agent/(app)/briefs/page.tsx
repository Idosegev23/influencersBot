'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Brief = {
  id: string;
  brand_name: string;
  amount: number | null;
  suggested_client_name: string | null;
  status: string;
  created_at: string;
};

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agent/briefs')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setBriefs(d.briefs || []);
      })
      .catch(() => setError('שגיאה בטעינת הבריפים'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl" className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--ink-900)]">בריפים</h1>
        <p className="text-sm text-[color:var(--ink-500)]">
          הצעות שנכנסו בוואטסאפ/מייל — בחר/י מיוצג, תמחר/י כל תוצר, ושלח/י הצעה לחתימה.
        </p>
      </div>

      {loading && <div className="text-sm text-[color:var(--ink-500)]">טוען…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && briefs.length === 0 && (
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-8 text-center text-sm text-[color:var(--ink-500)]">
          אין בריפים פתוחים. העבר/י הודעת וואטסאפ למספר בסטי כדי לפתוח בריף חדש.
        </div>
      )}

      <div className="grid gap-3">
        {briefs.map((b) => (
          <Link
            key={b.id}
            href={`/agent/briefs/${b.id}`}
            className="block rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 hover:border-[color:var(--brand)] transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--ink-900)] truncate">{b.brand_name}</div>
                <div className="text-[13px] text-[color:var(--ink-500)] truncate">
                  {b.suggested_client_name ? `מיוצג מוצע: ${b.suggested_client_name}` : 'לא זוהה מיוצג — יש לשייך'}
                </div>
              </div>
              <div className="text-left shrink-0">
                {b.amount ? (
                  <div className="text-sm font-medium text-[color:var(--ink-800)]">~{b.amount.toLocaleString('en-US')} ₪</div>
                ) : null}
                <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--ink-100)] text-[color:var(--ink-600)]">
                  {b.status === 'assigned' ? 'ממתין לתמחור' : 'חדש'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
