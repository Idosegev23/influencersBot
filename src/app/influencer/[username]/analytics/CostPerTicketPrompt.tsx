'use client';

/**
 * Inline prompt for the one input no API can supply: what it costs the brand to
 * have a person handle one support inquiry.
 *
 * It lives HERE, next to the metric it unlocks, rather than buried in settings —
 * a brand reading "חיסכון משוער · לא נמדד" should be one field away from fixing
 * it. The same value is also editable on the settings page; both write to
 * accounts.config.support.cost_per_ticket.
 *
 * Excluded from the printed report (vp-no-print): the export is a document, not
 * a form.
 */

import { useState } from 'react';

export default function CostPerTicketPrompt({
  username,
  current,
  onSaved,
}: {
  username: string;
  current: number | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(current === null ? '' : String(current));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const save = async () => {
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setState('failed');
      return;
    }
    setState('saving');
    try {
      const res = await fetch('/api/influencer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, cost_per_ticket: parsed }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('saved');
      onSaved();
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="vp-cost-prompt vp-no-print" dir="rtl">
      <div className="vp-cost-copy">
        <strong>{current === null ? 'רוצים לראות את החיסכון בשקלים?' : 'עלות טיפול בפנייה'}</strong>
        <span>
          כמה עולה לכם שאדם מטפל בפנייה אחת. חשבו את זה כעלות חודשית של שירות הלקוחות
          חלקי מספר הפניות בחודש. המספר הזה שלכם — הוא מה שהופך את הפניות שנחסכו לשקלים.
          כל עוד השדה ריק, החיסכון מוצג כ״לא נמדד״ ולא כאפס.
        </span>
      </div>
      <div className="vp-cost-row">
        <span className="vp-cost-currency">₪</span>
        <input
          type="number"
          min={0}
          step="0.5"
          inputMode="decimal"
          className="vp-cost-input"
          value={value}
          placeholder="12"
          onChange={(e) => { setValue(e.target.value); setState('idle'); }}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          aria-label="עלות טיפול בפנייה בשקלים"
        />
        <button type="button" className="vp-cost-save" onClick={save} disabled={state === 'saving'}>
          {state === 'saving' ? 'שומר…' : 'שמירה'}
        </button>
        {state === 'saved' && <span className="vp-cost-ok">נשמר ✓</span>}
        {state === 'failed' && <span className="vp-cost-err">לא נשמר — בדקו את הסכום</span>}
      </div>
    </div>
  );
}
