/**
 * i18n for the public onboarding wizard (/onboard/[token]).
 *
 * Standalone {he, en} catalog — deliberately NOT part of the dashboard i18n
 * bundle, since this is a public page with its own small string set. The admin
 * picks the language when creating the onboarding link; it is stored on
 * config.onboarding.language and read server-side in page.tsx. Anything that is
 * not 'en' falls back to Hebrew (the default).
 */

export type OnboardLang = 'he' | 'en';

export interface OnboardStrings {
  dir: 'rtl' | 'ltr';
  loading: string;
  form: {
    heading: (accountName: string) => string;
    subtitle: string;
    igLabel: string;
    igConnected: (username: string) => string;
    igConnect: string;
    igHint: string;
    website: string;
    tiktok: string;
    youtube: string;
    optionalHint: string;
    startBtn: string;
    startingBtn: string;
    canStartHint: string;
  };
  errors: { needIg: string; generic: string };
  scanning: { heading: string; subtitle: string; notify: string };
  done: { heading: string; subtitle: string };
  error: { heading: string; subtitle: string };
  footer: string;
}

const he: OnboardStrings = {
  dir: 'rtl',
  loading: 'טוען…',
  form: {
    heading: (name) => `שמחים שהצטרפת, ${name} 🎉`,
    subtitle: 'כמה פרטים אחרונים ומתחילים לבנות לך עוזר AI חכם.',
    igLabel: 'חשבון אינסטגרם',
    igConnected: (u) => `מחובר — @${u} ✓`,
    igConnect: 'חבר/י אינסטגרם',
    igHint: 'מתחברים פעם אחת — כדי שהבוט ילמד את התוכן שלך ויענה לעוקבים.',
    website: 'אתר אינטרנט',
    tiktok: 'שם משתמש טיקטוק',
    youtube: 'שם משתמש יוטיוב',
    optionalHint: 'הכל אופציונלי — מלא/י מה שיש (מספיק מקור אחד: אינסטגרם, אתר, טיקטוק או יוטיוב).',
    startBtn: 'התחילו לבנות את החשבון שלי 🚀',
    startingBtn: 'מתחילים…',
    canStartHint: 'מלאו לפחות מקור אחד (או חברו אינסטגרם) כדי להתחיל',
  },
  errors: {
    needIg: 'צריך לחבר אינסטגרם קודם',
    generic: 'משהו השתבש, נסו שוב',
  },
  scanning: {
    heading: 'בונים את החשבון שלך…',
    subtitle: 'סורקים את כל התוכן ובונים את הפרסונה. זה יכול לקחת כמה שעות — אפשר לסגור את הדף.',
    notify: 'כשנסיים — נשלח לך הודעת וואטסאפ ומייל עם קישור לבסטי שלך.',
  },
  done: {
    heading: 'הכל מוכן!',
    subtitle: 'שלחנו לך לוואטסאפ ולמייל קישור לבסטי שלך. נתראה שם!',
  },
  error: {
    heading: 'משהו השתבש בסריקה',
    subtitle: 'הצוות שלנו קיבל התראה ויטפל בזה — נחזור אליך בהקדם.',
  },
  footer: 'מאובטח · BestieAI © LDRS',
};

const en: OnboardStrings = {
  dir: 'ltr',
  loading: 'Loading…',
  form: {
    heading: (name) => `Glad you joined, ${name} 🎉`,
    subtitle: "A few last details and we'll start building your smart AI assistant.",
    igLabel: 'Instagram account',
    igConnected: (u) => `Connected — @${u} ✓`,
    igConnect: 'Connect Instagram',
    igHint: 'Connect once — so the bot can learn your content and reply to your followers.',
    website: 'Website',
    tiktok: 'TikTok username',
    youtube: 'YouTube username',
    optionalHint: 'All optional — add what you have (one source is enough: Instagram, website, TikTok or YouTube).',
    startBtn: 'Start building my account 🚀',
    startingBtn: 'Starting…',
    canStartHint: 'Add at least one source (or connect Instagram) to start',
  },
  errors: {
    needIg: 'Please connect Instagram first',
    generic: 'Something went wrong, please try again',
  },
  scanning: {
    heading: 'Building your account…',
    subtitle: "We're scanning all your content and building your persona. This can take a few hours — you can close this page.",
    notify: "When we're done — we'll send you a WhatsApp and email with a link to your Bestie.",
  },
  done: {
    heading: 'All set!',
    subtitle: "We've sent a link to your Bestie by WhatsApp and email. See you there!",
  },
  error: {
    heading: 'Something went wrong during the scan',
    subtitle: "Our team has been alerted and will handle it — we'll get back to you soon.",
  },
  footer: 'Secure · BestieAI © LDRS',
};

export const onboardStrings: Record<OnboardLang, OnboardStrings> = { he, en };

/** Coerce any stored value to a supported language (default Hebrew). */
export function onboardLang(value: unknown): OnboardLang {
  return value === 'en' ? 'en' : 'he';
}
