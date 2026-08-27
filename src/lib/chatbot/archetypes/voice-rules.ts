/**
 * The Hebrew grammatical-voice directive.
 *
 * WHY THE PLURAL BRANCH EXISTS: the rule used to test `firstPerson` for
 * נקבה / זכר only, and everything else fell through to a neutral branch that
 * *instructs* gender slashes ('השתמש/י בסלאש כשצריך: "ממליצ/ה", "אומר/ת"').
 *
 * 41 accounts declare `firstPerson: "גוף ראשון רבים"` — LDRS, Argania,
 * LA BEAUTÉ, SodaStream, Burger King, Clinique, Studio Pasha, מאוחדת and the
 * rest. A company speaking as "אנחנו" has no gender to hedge, so all of them were
 * told to produce broken Hebrew and duly did: "אנחנו יכול/ים", "אנחנו צריכ/ה",
 * "אנחנו מתחיל/ים", "אנחנו מאמינ/ה", and the outright nonsense "אכוונ/ן".
 *
 * The slash is still correct in the other direction — the reader's gender really
 * is unknown, so "תשלח/י" stays.
 *
 * Order matters: feminine and masculine are checked FIRST so an account that is
 * both plural and feminine (stylearomatherapyil) keeps the voice it already had.
 */

export interface VoiceRulesLike {
  firstPerson?: string | null;
  identity?: { entityType?: string | null; who?: string | null } | null;
}

const FEMININE = /נקבה|female|feminine/i;
const MASCULINE = /זכר|male|masculine/i;
const PLURAL = /רבים|plural/i;

/** Entities that speak as an organisation rather than as a person. */
const ORG_ENTITY = /business|brand|מותג|association|agency|company/i;

const NEUTRAL =
  'דבר/י בלשון ניטרלית. השתמש/י בסלאש כשצריך: "ממליצ/ה", "אומר/ת".';

export function hebrewVoiceDirective(voiceRules: VoiceRulesLike | null | undefined): string {
  const firstPerson = voiceRules?.firstPerson || '';
  const entityType = voiceRules?.identity?.entityType || '';

  if (FEMININE.test(firstPerson)) {
    return 'דברי בלשון נקבה. פני לעוקבות בלשון נקבה כברירת מחדל, אלא אם ברור שמדובר בגבר.';
  }
  if (MASCULINE.test(firstPerson)) {
    return 'דבר בלשון זכר. פנה לעוקבים בלשון ניטרלית או זכר כברירת מחדל.';
  }
  if (PLURAL.test(firstPerson)) {
    const org = ORG_ENTITY.test(entityType);
    return (
      'דברו על עצמכם בגוף ראשון רבים — "אנחנו", "בנינו", "אנחנו ממליצים". ' +
      'אין מגדר לגוף ראשון רבים, ולכן אסור לפצל את הפעלים שלכם בלוכסן: ' +
      'כתבו "אנחנו יכולים" ולא "אנחנו יכול/ים", "אנחנו צריכים" ולא "אנחנו צריכ/ה". ' +
      'הלוכסן נשאר נכון רק כשפונים אל הפונה, שמגדרו לא ידוע: "תשלח/י", "אם תרצה/י".' +
      (org
        ? ' אתם עונים בשם העסק ומטעמו, לא כעוזר אישי של מי שכתב לכם: ' +
          'אל תציעו לנסח, לכתוב או לתרגם עבורו תשובה שהוא ישלח למישהו אחר — גם לא כשהפנייה היא ספאם, ' +
          'הצעה מסחרית או הודעה בשפה זרה. ענו לפונה כמו שהעסק היה עונה לו.'
        : '')
    );
  }
  return NEUTRAL;
}
