// Chatbot settings page (/influencer/[username]/chatbot-settings).
// Keys are added during the i18n extraction pass; he is canonical, en must mirror it.
export const chatbotSettings = {
  he: {
    // Header
    pageTitle: 'הגדרות צ\'אטבוט',
    pageSubtitle: 'ניהול הפרסונה והמידע של הצ\'אטבוט שלך',
    livePreview: 'צפייה חיה',

    // DM bot toggle
    dmBotTitle: 'בוט DM באינסטגרם',
    connectedTo: 'מחובר ל-',
    noIgConnection: 'אין חיבור אינסטגרם פעיל',
    on: 'פעיל',
    off: 'כבוי',
    dmBotOnDesc: 'הבוט עונה אוטומטית על הודעות DM באינסטגרם. כבה כדי לענות ידנית.',
    dmBotOffDesc: 'הבוט כבוי — הודעות DM לא ייענו אוטומטית.',

    // Statistics cards
    statPosts: 'פוסטים בבסיס',
    statComments: 'תגובות נאספו',
    statTopics: 'נושאים מזוהים',
    statLastScan: 'סריקה אחרונה',

    // Build persona section
    buildPersonaTitle: 'בניית פרסונה',
    buildFromScratch: 'בניית פרסונה מאפס',
    buildDuration: 'תארך כ-20-30 דקות ותעבור על 7 שלבים:',
    step1: 'סריקת 500 פוסטים אחרונים',
    step2: 'סריקת 7,500 תגובות מהפוסטים המובילים',
    step3: 'ניתוח פרופיל והאשטגים',
    step4: 'בניית מפת ידע מקצועית עם Gemini Pro',
    rebuildButton: 'התחל בניית פרסונה מחדש',
    dailyUpdateTip: 'טיפ: עדכונים יומיים רצים אוטומטית בכל לילה ב-02:00',

    // History section
    historyTitle: 'היסטוריית סריקות',
    noHistory: 'אין עדיין היסטוריית סריקות. התחל בניית פרסונה ראשונה!',
    colDate: 'תאריך',
    colStatus: 'סטטוס',
    colType: 'סוג',
    colDuration: 'משך',
    colResults: 'תוצאות',
    typeFullRebuild: 'סריקה מלאה',
    typeQuickUpdate: 'עדכון מהיר',
    resultPosts: 'פוסטים',
    resultComments: 'תגובות',

    // Embed section
    embedTitle: 'הטמעת Widget',
    embedDesc: 'העתק את הקוד הבא והטמע אותו באתר האישי שלך כדי להוסיף את הצ\'אטבוט:',
    copyButton: 'העתק',
    directLink: 'קישור ישיר:',
    shareLinkHint: 'שתף קישור זה עם העוקבים שלך בסטורי, בביו או בלינקים',

    // Live preview modal
    previewHeader: 'צפייה חיה — כך העוקבים רואים את הצ׳אט',
    openInNewTab: 'פתח בטאב חדש',
    previewIframeTitle: 'תצוגה מקדימה חיה',
    previewFooter: 'זה הצ׳אט כמו שהעוקבים שלך רואים אותו — נסו לשלוח הודעה',

    // Toasts + relative time ({n} is the numeric value)
    codeCopied: 'קוד הועתק ללוח!',
    never: 'אף פעם',
    justNow: 'עכשיו',
    daysAgo: 'לפני {n} ימים',
    hoursAgo: 'לפני {n} שעות',

    // Job status badges
    statusCompleted: 'הושלם',
    statusRunning: 'רץ',
    statusFailed: 'נכשל',
    statusPending: 'ממתין',
    statusCancelled: 'בוטל',
  },
  en: {
    // Header
    pageTitle: 'Chatbot Settings',
    pageSubtitle: 'Manage your chatbot persona and knowledge',
    livePreview: 'Live preview',

    // DM bot toggle
    dmBotTitle: 'Instagram DM bot',
    connectedTo: 'Connected to ',
    noIgConnection: 'No active Instagram connection',
    on: 'On',
    off: 'Off',
    dmBotOnDesc: 'The bot auto-replies to Instagram DMs. Turn off to reply manually.',
    dmBotOffDesc: 'The bot is off — DMs won’t be answered automatically.',

    // Statistics cards
    statPosts: 'Posts in KB',
    statComments: 'Comments collected',
    statTopics: 'Detected topics',
    statLastScan: 'Last scan',

    // Build persona section
    buildPersonaTitle: 'Build persona',
    buildFromScratch: 'Building persona from scratch',
    buildDuration: 'takes 20–30 minutes and runs 7 stages:',
    step1: 'Scrape 500 most-recent posts',
    step2: 'Scrape 7,500 comments from top posts',
    step3: 'Profile and hashtag analysis',
    step4: 'Build professional knowledge map with Gemini Pro',
    rebuildButton: 'Rebuild persona',
    dailyUpdateTip: 'Tip: daily updates run automatically every night at 02:00.',

    // History section
    historyTitle: 'Scan history',
    noHistory: 'No scan history yet. Start your first persona build!',
    colDate: 'Date',
    colStatus: 'Status',
    colType: 'Type',
    colDuration: 'Duration',
    colResults: 'Results',
    typeFullRebuild: 'Full rebuild',
    typeQuickUpdate: 'Quick update',
    resultPosts: 'posts',
    resultComments: 'comments',

    // Embed section
    embedTitle: 'Widget embed',
    embedDesc: 'Copy this snippet and embed it on your site to add the chatbot:',
    copyButton: 'Copy',
    directLink: 'Direct link:',
    shareLinkHint: 'Share this link in stories, your bio or in marketing.',

    // Live preview modal
    previewHeader: 'Live preview — how visitors see the chat',
    openInNewTab: 'Open in new tab',
    previewIframeTitle: 'Live preview',
    previewFooter: 'This is the chat as visitors see it — try sending a message.',

    // Toasts + relative time ({n} is the numeric value)
    codeCopied: 'Code copied!',
    never: 'Never',
    justNow: 'just now',
    daysAgo: '{n}d ago',
    hoursAgo: '{n}h ago',

    // Job status badges
    statusCompleted: 'Completed',
    statusRunning: 'Running',
    statusFailed: 'Failed',
    statusPending: 'Pending',
    statusCancelled: 'Cancelled',
  },
} as const;
