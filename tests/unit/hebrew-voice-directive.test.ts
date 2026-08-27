import { describe, it, expect } from 'vitest';
import { hebrewVoiceDirective } from '@/lib/chatbot/archetypes/voice-rules';

/**
 * Regression: the ⚠️ מגדר rule tested `voiceRules.firstPerson` for נקבה / זכר and
 * fell through to a neutral branch that *instructs* gender slashes —
 * 'דבר/י בלשון ניטרלית. השתמש/י בסלאש כשצריך: "ממליצ/ה", "אומר/ת"'.
 *
 * 41 accounts have `firstPerson: "גוף ראשון רבים"` (LDRS, Argania, LA BEAUTÉ,
 * SodaStream, Burger King, Clinique, מאוחדת …). A company speaking as "אנחנו" has
 * no gender to hedge, so every one of them was told to produce broken Hebrew, and
 * did: "אנחנו יכול/ים", "אנחנו צריכ/ה", "אנחנו מתחיל/ים", "אכוונ/ן".
 */
describe('hebrewVoiceDirective', () => {
  const plural = { firstPerson: 'גוף ראשון רבים', identity: { entityType: 'business' } };

  it('tells a first-person-plural business to write plain plural, with no slashes on its own verbs', () => {
    const d = hebrewVoiceDirective(plural);
    expect(d).toContain('גוף ראשון רבים');
    expect(d).toContain('אנחנו יכולים'); // the correct form is spelled out
    expect(d).toContain('אנחנו יכול/ים'); // named as the thing to stop doing
    // The reader's gender is still unknown, so addressing them keeps the slash.
    expect(d).toContain('תשלח/י');
  });

  it('still lets it hedge the gender of the person it is talking to', () => {
    expect(hebrewVoiceDirective(plural)).toMatch(/פונה|משתמש|קורא/);
  });

  it('keeps a feminine creator feminine — even when the voice is also plural', () => {
    // stylearomatherapyil is both: the feminine rule must keep winning.
    const d = hebrewVoiceDirective({ firstPerson: 'גוף ראשון רבים ונקבה', identity: { entityType: 'brand' } });
    expect(d).toContain('נקבה');
    expect(d).not.toContain('גוף ראשון רבים');
  });

  it('leaves the singular creator branches exactly as they were', () => {
    expect(hebrewVoiceDirective({ firstPerson: 'לשון נקבה' })).toContain('נקבה');
    expect(hebrewVoiceDirective({ firstPerson: 'לשון זכר' })).toContain('זכר');
  });

  it('falls back to the neutral slash rule when nothing is known', () => {
    for (const vr of [undefined, null, {}, { firstPerson: '' }]) {
      const d = hebrewVoiceDirective(vr as any);
      expect(d).toContain('ניטרלית');
      expect(d).toContain('ממליצ/ה');
    }
  });

  it('never tells a plural voice to slash its own verbs', () => {
    const d = hebrewVoiceDirective(plural);
    expect(d).not.toContain('ממליצ/ה'); // the neutral rule's example must be gone
  });
});

/**
 * Second half: the bot repeatedly answered a STRANGER as if it were that
 * stranger's own assistant — "אם תרצה/י, אני יכול/ה לנסח לך תשובה יותר קצרה
 * לשליחה חזרה" (2026-03-17), and it did the same to a Russian brand pitch and a
 * replica spammer. It was offering to ghostwrite the sender's reply to LDRS.
 */
describe('hebrewVoiceDirective — who the bot is', () => {
  it('tells a business it answers ON BEHALF of itself, never drafts for the sender', () => {
    const d = hebrewVoiceDirective({ firstPerson: 'גוף ראשון רבים', identity: { entityType: 'business' } });
    expect(d).toContain('לנסח');
    expect(d).toMatch(/בשם|מטעם/);
  });
});
