'use client';

/**
 * Inline prompt for the one input no API can supply: what it costs the brand to
 * have a person handle one support inquiry.
 *
 * It lives HERE, next to the metric it unlocks, rather than buried in settings —
 * a brand reading "Estimated saving · Not measured" should be one field away from fixing
 * it. The same value is also editable on the settings page; both write to
 * accounts.config.support.cost_per_ticket.
 *
 * Excluded from the printed report (vp-no-print): the export is a document, not
 * a form.
 */

import { useState } from 'react';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';

export default function CostPerTicketPrompt({
  username,
  current,
  onSaved,
}: {
  username: string;
  current: number | null;
  onSaved: () => void;
}) {
  const { lang } = useDashboardLang(username);
  const isEn = lang === 'en';
  const T = getDashboardStrings(lang).valueProof;
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
    <div className="vp-cost-prompt vp-no-print" dir={isEn ? 'ltr' : 'rtl'}>
      <div className="vp-cost-copy">
        <strong>{current === null ? T.costPromptCta : T.costPromptTitle}</strong>
        <span>{T.costPromptBody}</span>
      </div>
      <div className="vp-cost-row">
        <span className="vp-cost-currency">{isEn ? '$' : '₪'}</span>
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
          aria-label={T.costAria}
        />
        <button type="button" className="vp-cost-save" onClick={save} disabled={state === 'saving'}>
          {state === 'saving' ? T.saving : T.save}
        </button>
        {state === 'saved' && <span className="vp-cost-ok">{T.savedOk}</span>}
        {state === 'failed' && <span className="vp-cost-err">{T.saveErr}</span>}
      </div>
    </div>
  );
}
