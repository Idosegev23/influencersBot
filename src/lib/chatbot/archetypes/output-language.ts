/**
 * Authoritative output-language directive.
 *
 * WHY BOTH SIDES EXIST NOW: this used to be `isEnglish ? LANG_DIRECTIVE_EN : ''`.
 * The prompt scaffolding is authored in Hebrew, so Hebrew output was assumed to
 * follow for free — but nothing actually pinned it. Once one English turn entered
 * a thread, the model kept answering in English and there was no instruction to
 * pull it back.
 *
 * That is what happened on ldrs_group (`accounts.language = 'he'`): on 2026-07-27
 * a bare "היי" was answered with "Hey, how's it going? ✨", and on 2026-08-13 a
 * brand sent five consecutive Hebrew messages and got English replies through the
 * entire qualification, lead capture included. The inverse also occurred — an
 * English sender on 2026-07-09 was answered in Hebrew.
 *
 * The account language is the decision, not the language of the last message: a
 * Hebrew business answers in Hebrew even when someone opens in English.
 */

const TAGS_NOTE =
  'Structural tags such as <<SUGGESTIONS>> / <<INTENT>> stay literal, but every human-facing string inside them counts as visible output.';

const LANG_DIRECTIVE_EN =
  '🌍 OUTPUT LANGUAGE: Respond to the user ONLY in English. The instructions below are written in Hebrew for internal authoring convenience — translate the *intent*, never the *output*. ' +
  TAGS_NOTE +
  ' Do not transliterate, do not mix languages.\n\n';

const LANG_DIRECTIVE_HE =
  '🌍 שפת הפלט: ענה/י למשתמש בעברית בלבד, בכל תשובה, גם אם הודעות קודמות בשיחה הזו נכתבו באנגלית (English) או בכל שפה אחרת, וגם אם הפונה כתב/ה באנגלית. ' +
  'אם התשובה הקודמת שלך יצאה באנגלית — זו הייתה טעות, חזור/י לעברית עכשיו. ' +
  TAGS_NOTE.replace('Structural tags', 'תגיות מבנה כמו') +
  ' שמות מותגים, מונחים מקצועיים וכתובות אתרים יכולים להישאר באותיות לטיניות; המשפטים עצמם — עברית.\n\n';

/**
 * @param language `accounts.language` ('he' | 'en'); anything else falls back to
 *   Hebrew, which is the product default.
 */
export function outputLanguageDirective(language: string | null | undefined): string {
  return (language || 'he').trim().toLowerCase() === 'en' ? LANG_DIRECTIVE_EN : LANG_DIRECTIVE_HE;
}
