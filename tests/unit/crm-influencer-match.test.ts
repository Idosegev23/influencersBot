import { describe, it, expect } from 'vitest';
import { pickInfluencerAccount } from '@/lib/crm/match-influencer';

// Real roster shape from production (config JSONB).
const dani = { id: 'dani', config: { display_name: 'דני שובבני', phone: '972545886779' } };
const danielle = { id: 'danielle', config: { display_name: 'Danielle Amit', username: 'danielamit' } };
const roster = [dani, danielle];

describe('pickInfluencerAccount', () => {
  // Regression: the exact brief that produced "לא זוהה לקוח תואם" in production.
  it('matches the influencer by NAME when the brief carries no phone (Dani regression)', () => {
    const brief = 'הצעה לקמפיין סודהסטרים משפיען דני שובבני. 3 רילסים וסטורי אחד. 80,000 ש״ח';
    expect(pickInfluencerAccount(roster, [], brief)?.id).toBe('dani');
  });

  it('matches by phone when a normalized phone is present', () => {
    expect(pickInfluencerAccount(roster, ['972545886779'], null)?.id).toBe('dani');
  });

  it('matches by username mention', () => {
    expect(pickInfluencerAccount(roster, [], 'קמפיין עבור danielamit לצומי')?.id).toBe('danielle');
  });

  it('phone wins over an unrelated name in the text', () => {
    const brief = 'הצעה עבור דני שובבני';
    // phone belongs to Danielle here → phone is the stronger signal
    const rosterWithDaniellePhone = [
      dani,
      { id: 'danielle', config: { display_name: 'Danielle Amit', phone: '972500000000' } },
    ];
    expect(pickInfluencerAccount(rosterWithDaniellePhone, ['972500000000'], brief)?.id).toBe('danielle');
  });

  it('returns null when neither name nor phone matches', () => {
    expect(pickInfluencerAccount(roster, [], 'הצעה לקמפיין ללא שם מוכר')).toBeNull();
  });

  it('returns null on an empty roster', () => {
    expect(pickInfluencerAccount([], ['972545886779'], 'דני שובבני')).toBeNull();
  });
});
