import { describe, it, expect } from 'vitest';
import { describeAccountForChips } from '@/lib/widget/chips-context';

describe('describeAccountForChips', () => {
  it('tells the model an influencer is a person, with niche and subtitle', () => {
    // Elit Yagoda: the bare name "Elit" read as the chocolate brand עלית,
    // so her chips asked about chocolate. The fix is context, not a name list.
    const out = describeAccountForChips({
      display_name: 'Elit Yagoda',
      archetype: 'influencer',
      influencer_type: 'travel',
      chat_subtitle: 'אני כאן לעזור עם יעדים, טיולים וקופונים',
    });
    expect(out).toMatch(/person/i);
    expect(out).toContain('travel');
    expect(out).toContain('יעדים, טיולים');
  });

  it('does not call a brand a person', () => {
    const out = describeAccountForChips({ display_name: 'ARGANIA', archetype: 'brand', influencer_type: 'beauty' });
    expect(out).toContain('beauty');
    expect(out).not.toMatch(/person/i);
  });

  it('prefers persona_summary, then widget welcomeMessage, then chat_subtitle', () => {
    expect(describeAccountForChips({ persona_summary: 'A', widget: { welcomeMessage: 'B' }, chat_subtitle: 'C' })).toContain('A');
    expect(describeAccountForChips({ widget: { welcomeMessage: 'B' }, chat_subtitle: 'C' })).toContain('B');
    const onlySubtitle = describeAccountForChips({ chat_subtitle: 'C' });
    expect(onlySubtitle).toContain('Description: C');
  });

  it('returns no description line when nothing is known', () => {
    expect(describeAccountForChips({})).not.toContain('Description:');
  });
});
