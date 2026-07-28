/**
 * Landing-page i18n — every string on the public marketing page.
 *
 * Hebrew lives at "/", English at "/en". Both routes render the same
 * `<LandingPage lang={…} />`; only this catalog and the layout direction change.
 *
 * `he` is authored first and `en` is typed as `LandingStrings`, so a missing key
 * is a compile error. Because the repo sets `typescript.ignoreBuildErrors`, that
 * guard alone is not enough to stop a bad deploy — `tests/unit/landing-i18n.test.ts`
 * re-checks parity at runtime, which is what actually fails CI.
 *
 * The English copy is written for the market, not transliterated from Hebrew.
 * "התוכן שלך יודע לדבר חזרה" word-for-word reads like a bad subtitle; "Your
 * content talks back" is the same idea in English's own register.
 */

export type LandingLang = 'he' | 'en';

/* Deliberately NOT `as const`: widening the literals to `string` is what lets
   `const en: LandingStrings` check keys instead of demanding identical text. */
const he = {
  /* ---------------------------------------------------------------- */
  /*  Navbar                                                           */
  /* ---------------------------------------------------------------- */
  nav: {
    links: [
      { href: '#demo', label: 'דמו חי' },
      { href: '#capabilities', label: 'יכולות' },
      { href: '#how', label: 'איך זה עובד' },
      { href: '/onboarding-guide', label: 'אונבורדינג' },
      { href: '#faq', label: 'שאלות' },
    ],
    login: 'כניסה למערכת',
    cta: 'מעוניינים לשמוע',
    ctaMobile: 'שלחו פנייה',
    menuLabel: 'תפריט',
    /* The switcher always names the OTHER language, in that language — an
       English speaker who cannot read Hebrew still recognises "English". */
    switchLabel: 'English',
    switchTitle: 'Switch to English',
  },

  /* ---------------------------------------------------------------- */
  /*  Hero                                                             */
  /* ---------------------------------------------------------------- */
  hero: {
    badge: 'חשבונות פעילים · עונה בפחות מ-3 שניות',
    titleLead: 'התוכן שלך',
    titleHighlight: 'יודע לדבר',
    titleTail: 'חזרה.',
    subtitle:
      'BestieAI סורק כל פוסט, רילס וסטורי שפרסמתם. מתמלל סרטונים, ' +
      'קורא את האתר, ובונה AI שעונה לעוקבים באינסטגרם, באתר, ' +
      'ובוואטסאפ — בקול שלכם, בעברית, מסביב לשעון.',
    ctaPrimary: 'מעוניינים לשמוע עוד',
    ctaSecondary: 'נסו דמו חי',
    fineprint: 'ללא כרטיס אשראי · ללא קוד · ללא התחייבות',
    scrollHint: 'scroll',
  },

  /* ---------------------------------------------------------------- */
  /*  Interactive demo                                                 */
  /* ---------------------------------------------------------------- */
  demo: {
    eyebrow: 'דמו חי',
    titleLead: 'לחצו על שאלה.',
    titleHighlight: 'תראו איך הוא עונה.',
    subtitle:
      'אלה לא תסריטים. הבוט מייצר תשובה חדשה בכל פעם, ' +
      'מבוססת על התוכן האמיתי של היוצר.',
    chromeLabel: 'your_brand · Direct',
    disclaimer: 'תשובות לדוגמה — הבוט האמיתי שלכם מחובר לתוכן שלכם',
    entries: [
      {
        tag: 'טיפוח',
        q: 'היי, ראיתי את הרילס על הסרום לפנים — איזה מותג זה?',
        a: 'זה הסרום ויטמין C של ארגניה. הצגתי אותו בסטורי מיום שלישי, אני משתמשת בו כבר שלושה חודשים. יש קוד הנחה BESTIE15 ל-15%. רוצה שאשלח לינק?',
      },
      {
        tag: 'אופנה',
        q: 'איפה קנית את השמלה מהפוסט של אתמול?',
        a: 'היא של Zara מהקולקציה החדשה — הוספתי את הלינק לסיפור המוצמד "קניות השבוע". אגב, יש לי גם בגרסה שחורה אם את מעדיפה.',
      },
      {
        tag: 'שת״פ',
        q: 'שלום, אני מ-Brand X — מתעניינים בשת״פ. מה התעריפים שלך?',
        a: 'נעים להכיר. את הפרטים הטכניים ותעריפים מטפלת המנהלת שלי — מעבירה אותך אליה: sara@ldrs.co. תוכלי לשלוח בריף קצר עם המטרות?',
      },
      {
        tag: 'בישול',
        q: 'מתי המתכון לעוגת השוקולד שהבטחת?',
        a: 'שמתי אותו בפוסט מיום שני — שמרתי גם בהיילייט "מתכונים". הטיפ הכי חשוב: חמאה ב-20°C, לא 22, וגם לא מקצפים יותר מ-3 דקות.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /*  DM marquee                                                       */
  /* ---------------------------------------------------------------- */
  dmShowcase: {
    eyebrow: 'בזמן שאתם ישנים',
    title: 'שיחות אמיתיות שהבוט מטפל בהן.',
    rowOne: [
      { q: 'היי, ראיתי את הרילס על הסרום — איזה מותג זה?', a: 'זה סרום ויטמין C, הצגתי אותו בסטורי ביום שלישי. רוצה לינק?', tag: 'טיפוח' },
      { q: 'יש המלצה למתכון מהיר לערב?', a: 'בהיילייט "מתכונים" יש פסטה ב-15 דקות שכולם אוהבים.', tag: 'בישול' },
      { q: 'מאיפה השמלה מהפוסט האחרון?', a: 'מ-ZARA, הקולקציה החדשה. הלינק בהיילייט "קניות השבוע".', tag: 'אופנה' },
      { q: 'יש קוד הנחה למותג הזה?', a: 'כן! קוד BESTIE15 נותן 15% הנחה, תקף עד סוף החודש.', tag: 'קופונים' },
      { q: 'איזה קרם פנים את ממליצה לעור יבש?', a: 'הקרם מהרילס מלפני שבועיים — עם חמאת שיאה. מתאים בדיוק ליובש.', tag: 'טיפוח' },
      { q: 'מגיעה לאירוע בת״א?', a: 'כן, דוברת ביום חמישי ב-18:00. כל הפרטים בהיילייט.', tag: 'אירועים' },
    ],
    rowTwo: [
      { q: 'איך משלבים ספורט עם ילדים קטנים?', a: 'עשיתי על זה פוסט שלם — חפשי "בוקר רגיל" בפיד.', tag: 'הורות' },
      { q: 'מה התרגיל הכי טוב לבוקר מהיר?', a: '15 דקות בלי ציוד, מופיע בסטורי של יום ראשון.', tag: 'כושר' },
      { q: 'עובדת עם המותג הזה?', a: 'כן, שת״פ גלוי. הם נתנו קוד הנחה בלעדי לעוקבים שלי.', tag: 'שת״פ' },
      { q: 'מאיפה העגילים מהסטורי?', a: 'מהקולקציה החדשה של Shani Arieli — בסטורי יש את הקרדיט.', tag: 'אופנה' },
      { q: 'ראיתי את המלצת הספר, יש עוד כאלה?', a: 'בהיילייט "קריאה" יש 12 המלצות מהשנה האחרונה.', tag: 'המלצות' },
      { q: 'את עושה סדנאות אונליין?', a: 'הסדנה הבאה ביום שני, הרשמה דרך הלינק בביו.', tag: 'אירועים' },
    ],
  },

  /* ---------------------------------------------------------------- */
  /*  Moment of recognition                                            */
  /* ---------------------------------------------------------------- */
  recognition: {
    eyebrow: 'רגע של כנות',
    titleLead: 'חמישים אלף עוקבים.',
    titleTail: 'שלוש־מאות הודעות ביום.',
    bodyOne: 'כל אחת מהן יכולה להיות שת״פ, רכישה, לקוחה לחיים.',
    bodyTwo: 'ביממה יש 24 שעות — ואתם לא מכונה.',
    punchline: 'עכשיו יש לכם אחת.',
  },

  /* ---------------------------------------------------------------- */
  /*  Capabilities                                                     */
  /* ---------------------------------------------------------------- */
  capabilities: {
    eyebrow: 'מה זה עושה',
    titleLead: 'שש יכולות.',
    titleHighlight: 'כולן אמיתיות.',
    note:
      'ללא באזוורדס, ללא הבטחות שיווקיות. ' +
      'רק מה שהמערכת עושה היום עבור חשבונות אמיתיים.',
    cards: [
      {
        label: 'צ׳אטבוט',
        title: 'צ׳אטבוט שמדבר בקול שלכם',
        description: '12 ארכיטיפים — טיפוח, אופנה, בישול, כושר, הורות, קופונים ועוד. הסגנון, ההומור והקווים האדומים שלכם — מובנים לתוך הבוט.',
      },
      {
        label: 'אתר',
        title: 'וידג׳ט צ׳אט לאתר',
        description: 'שורת JavaScript אחת, והוא חי באתר שלכם. עונה על מוצרים, קופונים ותוכן — בזמן אמת.',
      },
      {
        label: 'מסמכים',
        title: 'ניתוח חוזים ובריפים',
        description: 'PDF, תמונה או Word — ה-AI מחלץ סכום, תאריכים, תנאים ודדליינים. שרשרת AI חכמה. 4 שפות.',
      },
      {
        label: 'דשבורד',
        title: 'דשבורד ניהולי מלא',
        description: 'אנליטיקס, שת״פים, הכנסות, קופונים, מסמכים, היסטוריית שיחות ופרסונה — הכול במקום אחד.',
      },
      {
        label: 'אינסטגרם',
        title: 'סריקת אינסטגרם + פרסונה',
        description: 'פוסטים, רילסים, סטוריז, היילייטס ותגובות נסרקים ונבנים ל-RAG חי. הפרסונה נבנית אוטומטית מהתוכן.',
      },
      {
        label: 'WhatsApp',
        title: 'התראות WhatsApp',
        description: 'דייג׳סט שבועי, ברוכים הבאים, תמיכה — על WhatsApp Cloud API הרשמי.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /*  How it works                                                     */
  /* ---------------------------------------------------------------- */
  howItWorks: {
    eyebrow: 'איך זה עובד',
    titleLead: 'שלושה שלבים.',
    titleHighlight: 'ללא טכנאי.',
    steps: [
      {
        title: 'מחברים חשבון',
        body: 'כניסה אחת לאינסטגרם. בלי קוד, בלי הגדרות, בלי טכנאי.',
        // The product has no 2FA of its own — the previous wording ("תמיכה ב-OAuth
        // 2.0 ואימות דו-שלבי") read as if it did. Login rides Meta's OAuth, which
        // carries whatever 2FA the user already has on their own account.
        detail: 'כניסה דרך OAuth 2.0 הרשמי של Meta — כולל האימות הדו-שלבי שכבר מוגדר בחשבון שלכם.',
      },
      {
        title: 'ה-AI לומד אתכם',
        body: 'פוסטים, רילסים, סטוריז והיילייטס נסרקים ומתומללים. הפרסונה נבנית מהתוכן עצמו — הסגנון, המוצרים, הקופונים, והדברים שלא עושים.',
        detail: 'סריקה חוזרת כל 24 שעות. עברית, אנגלית, ערבית, רוסית.',
      },
      {
        title: 'הבוט עולה לאוויר',
        body: 'עונה ב-DM, באתר וב-WhatsApp — בעברית, בקול שלכם, מסביב לשעון.',
        detail: 'סיכום שיחות שבועי לאימייל. כל שיחה לא ברורה עולה לסקירה.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /*  FAQ                                                              */
  /* ---------------------------------------------------------------- */
  faq: {
    eyebrow: 'שאלות',
    titleLead: 'מה כולם',
    titleHighlight: 'שואלים.',
    note: 'לא מצאתם תשובה? השאירו פרטים בטופס למטה.',
    items: [
      {
        q: 'באילו שפות זה עובד?',
        a: 'עברית (ראשית), אנגלית, ערבית ורוסית. שפת התשובה נקבעת לפי שפת הפנייה של העוקב.',
      },
      {
        q: 'מה קורה כשהבוט לא בטוח בתשובה?',
        a: 'הוא לא ממציא. מסמן את השיחה, שולח לכם התראה, אתם עונים — והוא לומד. לא חוזר עם אותה שאלה פעמיים.',
      },
      {
        q: 'מה עם פרטיות של השיחות והנתונים?',
        // Was: "multi-tenant עם Row-Level Security". RLS is not enabled on the
        // chat/account/user tables in production — isolation is enforced in the
        // application layer, so that is what we say.
        a: 'כל חשבון מבודד: כל גישה לנתונים מסוננת לפי מזהה החשבון בצד השרת, ומפתחות בסיס הנתונים לעולם לא מגיעים לדפדפן. שיחות מוצפנות בתעבורה, הגישה רק שלכם.',
      },
      {
        q: 'כמה זמן לוקח להקים?',
        a: 'מחיבור לאינסטגרם עד בוט פעיל: 30 דקות עד כמה שעות, תלוי בכמות התוכן. הסריקה רצה ברקע.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /*  CTA form                                                         */
  /* ---------------------------------------------------------------- */
  cta: {
    eyebrow: 'בואו נדבר',
    titleLead: 'מעוניינים',
    titleHighlight: 'לשמוע עוד?',
    lead:
      'השאירו פרטים — נחזור תוך 24 שעות עם דמו מותאם לתוכן שלכם. ' +
      'בלי ספאם, בלי מכירה בכוח, בלי ניוזלטר שלא ביקשתם.',
    responseTime: 'ממוצע תגובה: 4 שעות בשעות העבודה.',

    fullNameLabel: 'שם מלא',
    fullNamePlaceholder: 'ישראלה ישראלי',
    bizTypeLabel: 'סוג העסק',
    bizTypePlaceholder: 'בחרו',
    bizTypeOptions: ['יוצר/ת תוכן', 'מותג', 'סוכנות', 'אחר'],
    emailLabel: 'אימייל',
    emailPlaceholder: 'you@example.com',
    phoneLabel: 'טלפון',
    phonePlaceholder: '054-0000000',
    notesLabel: 'ספרו לנו קצת',
    notesOptional: '(אופציונלי)',
    notesPlaceholder: 'כמה עוקבים, איזה תחום, ומה הכי מפריע לכם היום',

    submit: 'שלחו פנייה',
    submitting: 'שולח…',
    submitNote: 'נחזור תוך 24 שעות · ללא ספאם · ללא ניוזלטר',

    errNameRequired: 'שם מלא חובה',
    errContactRequired: 'צריך אימייל או טלפון כדי שנוכל לחזור',
    errSendFailed: 'שגיאה בשליחה',
    errUnexpected: 'שגיאה לא צפויה',

    successTitle: 'קיבלנו.',
    successSubtitle: 'מדברים בקרוב.',
    successBody: 'נחזור אליכם תוך 24 שעות — לרוב הרבה יותר מהר.',

    /* Free-text field on the brief row. Sales reads it to know which language
       to reply in, so the two languages MUST stay distinguishable here. */
    serviceName: 'פנייה מדף הנחיתה',
  },

  /* ---------------------------------------------------------------- */
  /*  Footer                                                           */
  /* ---------------------------------------------------------------- */
  footer: {
    eyebrow: 'קולופון',
    quote: '"הכי טוב ב-DM — התחושה שמישהו באמת הקשיב."',
    navLabel: 'קישורי תחתית',
    links: [
      { href: '/admin', label: 'כניסה למערכת' },
      { href: '/onboarding-guide', label: 'אונבורדינג' },
      { href: '#contact', label: 'צרו קשר' },
      { href: '#faq', label: 'שאלות' },
      { href: '/privacy', label: 'מדיניות פרטיות' },
      { href: '/terms', label: 'תנאי שימוש' },
      { href: '/data-deletion', label: 'מחיקת נתונים' },
    ],
    rights: 'All rights reserved',
    builtBy: 'נבנה ב-',
    city: 'Tel Aviv',
  },
};

export type LandingStrings = typeof he;

/* The annotation is the point: drop a key here and `tsc` flags it. */
const en: LandingStrings = {
  nav: {
    /* No /onboarding-guide entry — that page exists only in Hebrew, and sending
       an English visitor to it is worse than not offering the link. */
    links: [
      { href: '#demo', label: 'Live demo' },
      { href: '#capabilities', label: 'Capabilities' },
      { href: '#how', label: 'How it works' },
      { href: '#faq', label: 'FAQ' },
    ],
    login: 'Log in',
    cta: 'Book a demo',
    ctaMobile: 'Get in touch',
    menuLabel: 'Menu',
    switchLabel: 'עברית',
    switchTitle: 'מעבר לעברית',
  },

  hero: {
    badge: 'Live accounts · replies in under 3 seconds',
    titleLead: 'Your content',
    titleHighlight: 'talks',
    titleTail: 'back.',
    subtitle:
      'BestieAI reads every post, reel and story you have published. It ' +
      'transcribes your videos, crawls your site, and builds an AI that answers ' +
      'your followers on Instagram, on your website, and on WhatsApp — in your ' +
      'voice, around the clock.',
    ctaPrimary: 'See it on your content',
    ctaSecondary: 'Try the live demo',
    fineprint: 'No credit card · No code · No commitment',
    scrollHint: 'scroll',
  },

  demo: {
    eyebrow: 'Live demo',
    titleLead: 'Pick a question.',
    titleHighlight: 'Watch it answer.',
    subtitle:
      'These are not scripts. The bot writes a fresh reply every time, grounded ' +
      'in the creator’s actual content.',
    chromeLabel: 'your_brand · Direct',
    disclaimer: 'Sample replies — your real bot is wired to your own content',
    entries: [
      {
        tag: 'Beauty',
        q: 'Hey! Saw your reel about the face serum — what brand is that?',
        a: 'That’s the Argania vitamin C serum. I showed it in Tuesday’s story and I’ve been using it for three months now. Code BESTIE15 gets you 15% off. Want me to send the link?',
      },
      {
        tag: 'Fashion',
        q: 'Where did you get the dress from yesterday’s post?',
        a: 'It’s Zara, from the new collection — I dropped the link in my pinned "This week’s picks" highlight. There’s a black version too if you prefer that.',
      },
      {
        tag: 'Partnerships',
        q: 'Hi, I’m with Brand X — we’d love to collaborate. What are your rates?',
        a: 'Lovely to hear from you. Rates and contracts go through my manager — I’m passing you to sara@ldrs.co. Could you send over a short brief with your goals?',
      },
      {
        tag: 'Food',
        q: 'When are you posting the chocolate cake recipe you promised?',
        a: 'It went up in Monday’s post — I also saved it to my "Recipes" highlight. The one thing that matters: butter at 20°C, not 22, and don’t whip it longer than 3 minutes.',
      },
    ],
  },

  dmShowcase: {
    eyebrow: 'While you sleep',
    title: 'Real conversations it handles on its own.',
    rowOne: [
      { q: 'Saw your reel about the serum — what brand is it?', a: 'It’s a vitamin C serum, I showed it in Tuesday’s story. Want the link?', tag: 'Beauty' },
      { q: 'Got a quick dinner recipe you’d recommend?', a: 'My "Recipes" highlight has a 15-minute pasta everyone loves.', tag: 'Food' },
      { q: 'Where is the dress from your last post?', a: 'ZARA, new collection. Link is in the "This week’s picks" highlight.', tag: 'Fashion' },
      { q: 'Is there a discount code for this brand?', a: 'Yes! Code BESTIE15 gets you 15% off, valid through the end of the month.', tag: 'Promos' },
      { q: 'Which face cream do you recommend for dry skin?', a: 'The one from my reel two weeks ago — shea butter base. Made exactly for dryness.', tag: 'Beauty' },
      { q: 'Are you coming to the Tel Aviv event?', a: 'Yes, speaking Thursday at 18:00. All the details are in my highlight.', tag: 'Events' },
    ],
    rowTwo: [
      { q: 'How do you fit workouts around small kids?', a: 'I did a whole post on it — search "an ordinary morning" in my feed.', tag: 'Parenting' },
      { q: 'Best exercise for a quick morning session?', a: '15 minutes, no equipment — it’s in Sunday’s story.', tag: 'Fitness' },
      { q: 'Are you working with this brand?', a: 'Yes, a disclosed partnership. They gave my followers an exclusive code.', tag: 'Partnerships' },
      { q: 'Where are the earrings from your story?', a: 'Shani Arieli’s new collection — the credit is tagged in the story.', tag: 'Fashion' },
      { q: 'Loved your book pick, do you have more?', a: 'My "Reading" highlight has 12 recommendations from the past year.', tag: 'Picks' },
      { q: 'Do you run online workshops?', a: 'Next one is Monday, sign-up through the link in my bio.', tag: 'Events' },
    ],
  },

  recognition: {
    eyebrow: 'A moment of honesty',
    titleLead: 'Fifty thousand followers.',
    titleTail: 'Three hundred messages a day.',
    bodyOne: 'Any one of them could be a partnership, a sale, a customer for life.',
    bodyTwo: 'There are 24 hours in a day — and you are not a machine.',
    punchline: 'Now you have a bestie.',
  },

  capabilities: {
    eyebrow: 'What it does',
    titleLead: 'Six capabilities.',
    titleHighlight: 'All of them real.',
    note:
      'No buzzwords, no roadmap promises. Only what the platform does today, ' +
      'for real accounts.',
    cards: [
      {
        label: 'Chatbot',
        title: 'A chatbot that sounds like you',
        description: '12 archetypes — beauty, fashion, food, fitness, parenting, promos and more. Your tone, your humour and your hard limits are built into the bot.',
      },
      {
        label: 'Website',
        title: 'Chat widget for your site',
        description: 'One line of JavaScript and it is live on your site. Answers questions about products, promo codes and content in real time.',
      },
      {
        label: 'Documents',
        title: 'Contract and brief parsing',
        description: 'PDF, image or Word — the AI pulls out amounts, dates, terms and deadlines. Multi-model fallback chain. 4 languages.',
      },
      {
        label: 'Dashboard',
        title: 'A full management dashboard',
        description: 'Analytics, partnerships, revenue, promo codes, documents, conversation history and persona — all in one place.',
      },
      {
        label: 'Instagram',
        title: 'Instagram scan + persona',
        description: 'Posts, reels, stories, highlights and comments are scanned into a live RAG index. The persona is built from the content itself.',
      },
      {
        label: 'WhatsApp',
        title: 'WhatsApp notifications',
        description: 'Weekly digest, welcome messages, support — over the official WhatsApp Cloud API.',
      },
    ],
  },

  howItWorks: {
    eyebrow: 'How it works',
    titleLead: 'Three steps.',
    titleHighlight: 'No engineer.',
    steps: [
      {
        title: 'Connect your account',
        body: 'One Instagram login. No code, no configuration, no technician.',
        detail: 'Sign-in through Meta’s official OAuth 2.0 — including whatever two-factor you already have on your own account.',
      },
      {
        title: 'The AI learns you',
        body: 'Posts, reels, stories and highlights are scanned and transcribed. The persona is built from the content itself — your style, your products, your promo codes, and the things you will not do.',
        detail: 'Re-scans every 24 hours. Hebrew, English, Arabic, Russian.',
      },
      {
        title: 'The bot goes live',
        body: 'It answers in DMs, on your site and on WhatsApp — in your voice, around the clock.',
        detail: 'Weekly conversation summary by email. Anything unclear is escalated for review.',
      },
    ],
  },

  faq: {
    eyebrow: 'FAQ',
    titleLead: 'What everyone',
    titleHighlight: 'asks.',
    note: 'Did not find your answer? Leave your details in the form below.',
    items: [
      {
        q: 'Which languages does it work in?',
        a: 'Hebrew, English, Arabic and Russian. The reply language is chosen from the language the follower wrote in.',
      },
      {
        q: 'What happens when the bot is not sure?',
        a: 'It does not invent an answer. It flags the conversation, alerts you, you reply — and it learns. The same question never comes back twice.',
      },
      {
        q: 'What about privacy of conversations and data?',
        a: 'Every account is isolated: all data access is filtered by account ID on the server, and database keys never reach the browser. Conversations are encrypted in transit, and access is yours alone.',
      },
      {
        q: 'How long does setup take?',
        a: 'From connecting Instagram to a live bot: 30 minutes to a few hours, depending on how much content there is. The scan runs in the background.',
      },
    ],
  },

  cta: {
    eyebrow: 'Let us talk',
    titleLead: 'Want to see',
    titleHighlight: 'it on your content?',
    lead:
      'Leave your details — we will come back within 24 hours with a demo built ' +
      'on your own content. No spam, no hard sell, no newsletter you did not ask for.',
    responseTime: 'Average response: 4 hours during business hours.',

    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Jane Doe',
    bizTypeLabel: 'Business type',
    bizTypePlaceholder: 'Choose',
    bizTypeOptions: ['Content creator', 'Brand', 'Agency', 'Other'],
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    phoneLabel: 'Phone',
    phonePlaceholder: '+1 555 000 0000',
    notesLabel: 'Tell us a little',
    notesOptional: '(optional)',
    notesPlaceholder: 'Audience size, your niche, and what frustrates you most today',

    submit: 'Send enquiry',
    submitting: 'Sending…',
    submitNote: 'We reply within 24 hours · No spam · No newsletter',

    errNameRequired: 'Full name is required',
    errContactRequired: 'We need an email or a phone number to get back to you',
    errSendFailed: 'Could not send. Please try again.',
    errUnexpected: 'Something went wrong',

    successTitle: 'Got it.',
    successSubtitle: 'Talk soon.',
    successBody: 'We will be back to you within 24 hours — usually much sooner.',

    serviceName: 'Landing page enquiry (English)',
  },

  footer: {
    eyebrow: 'Colophon',
    quote: '"The best part of a DM is the feeling that someone actually listened."',
    navLabel: 'Footer links',
    links: [
      { href: '/admin', label: 'Log in' },
      { href: '#contact', label: 'Contact' },
      { href: '#faq', label: 'FAQ' },
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of use' },
      { href: '/data-deletion', label: 'Data deletion' },
    ],
    rights: 'All rights reserved',
    builtBy: 'Built at ',
    city: 'Tel Aviv',
  },
};

const STRINGS: Record<LandingLang, LandingStrings> = { he, en };

/** Anything that is not an explicit 'en' falls back to Hebrew, the default market. */
export function getLandingStrings(lang: string | null | undefined): LandingStrings {
  return (lang || 'he').toLowerCase() === 'en' ? STRINGS.en : STRINGS.he;
}

/** Layout direction for the landing surface. */
export function landingDir(lang: string | null | undefined): 'ltr' | 'rtl' {
  return (lang || 'he').toLowerCase() === 'en' ? 'ltr' : 'rtl';
}

/** Exported for the parity test — keep in sync with `STRINGS`. */
export const LANDING_LANGS: LandingLang[] = ['he', 'en'];
export { STRINGS as LANDING_STRINGS };
