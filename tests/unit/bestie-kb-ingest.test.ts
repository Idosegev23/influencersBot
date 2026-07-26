import { describe, it, expect } from 'vitest';
import { planKbIngest } from '@/lib/bestie/kb-ingest';

const ok = {
  name: 'chatbot-settings.md',
  raw: `---\nkind: screen\ntitle: הגדרות הבוט\nroute: /influencer/[username]/chatbot-settings\n---\nלשונית ערוצים ← המתג "וואטסאפ פעיל".\n`,
};

const leaky = {
  name: 'internals.md',
  raw: `---\nkind: commercial\ntitle: איך זה עובד\n---\nהנתונים נשמרים ב-document_chunks.\n`,
};

const namesAnotherCustomer = {
  name: 'example.md',
  raw: `---\nkind: commercial\ntitle: דוגמה\n---\nArgania משתמשים בזה.\n`,
};

describe('planKbIngest', () => {
  it('passes clean entries through', () => {
    const plan = planKbIngest([ok], []);
    expect(plan.entries.map(e => e.id)).toEqual(['chatbot-settings']);
    expect(plan.blocked).toEqual([]);
  });

  it('blocks an entry that leaks infrastructure', () => {
    const plan = planKbIngest([ok, leaky], []);
    expect(plan.entries.map(e => e.id)).toEqual(['chatbot-settings']);
    expect(plan.blocked.map(b => b.id)).toEqual(['internals']);
    expect(plan.blocked[0].violations.length).toBeGreaterThan(0);
  });

  it('blocks an entry naming another customer', () => {
    const plan = planKbIngest([namesAnotherCustomer], ['Argania']);
    expect(plan.entries).toEqual([]);
    expect(plan.blocked.map(b => b.id)).toEqual(['example']);
  });

  it('checks the title as well as the body', () => {
    const titled = {
      name: 'x.md',
      raw: `---\nkind: commercial\ntitle: Argania onboarding\n---\nתוכן תמים לגמרי.\n`,
    };
    expect(planKbIngest([titled], ['Argania']).blocked.map(b => b.id)).toEqual(['x']);
  });
});
