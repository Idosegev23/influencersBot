// Chatbot persona page (/influencer/[username]/chatbot-persona).
export const chatbotPersona = {
  he: {
    // Header
    headerTitle: 'הבוט שלי',
    syncFromInstagram: 'סנכרון מאינסטגרם',

    // Stats strip
    statPostsInKb: 'פוסטים בבסיס',
    statTopics: 'נושאים',
    statLastScan: 'סריקה אחרונה',
    notYetScanned: 'טרם נסרק',

    // Instagram connection
    igConnectionTitle: 'חיבור אינסטגרם',
    igConnectedPrefix: 'מחובר — ',
    igNotConnected: 'לא מחובר',
    dmBot: 'בוט DM',
    connectInstagram: 'חבר אינסטגרם',

    // Empty persona state
    noPersonaTitle: 'אין פרסונה עדיין',
    noPersonaHelp: 'סנכרנו מאינסטגרם כדי לבנות את הפרסונה',

    // Voice & style
    voiceStyleTitle: 'קול וסגנון',
    tone: 'טון',
    perspective: 'פרספקטיבה',
    emojis: 'אימוג׳ים',
    storyStyle: 'סיפור',
    structure: 'מבנה',
    sassLevel: 'רמת חוצפה',
    language: 'שפה',
    signaturePhrases: 'ביטויים אופייניים',
    recurringPhrases: 'ביטויים חוזרים',
    avoidedWords: 'מילים שנמנע מהן',

    // Knowledge map
    knowledgeMapTitle: 'מפת ידע',
    coreTopics: 'נושאי ליבה',
    areasOfExpertise: 'תחומי מומחיות',

    // About
    aboutTitle: 'אודות',
    bio: 'ביו',
    interests: 'תחומי עניין',
    directives: 'הנחיות',

    // Welcome message
    welcomeMessageTitle: 'הודעת פתיחה',

    // Chat link
    chatLink: 'קישור לצ׳אט',
    openChat: 'פתח צ׳אט',
      // Persona editor
    editorTitle: 'כללי הבוט — עריכה',
    editorHelp: 'מה שתכתבו כאן משנה את מה שהבוט אומר. שינויים נשמרים מיד ולא נדרסים בסריקה הבאה.',
    editTone: 'טון',
    editToneHelp: 'איך הבוט נשמע. משפט אחד.',
    editDirectives: 'הנחיות — מה לכלול וממה להימנע',
    editDirectivesHelp: 'כללים בשפה חופשית. לדוגמה: "תמיד לציין שהמחירים תקפים עד 30 ביוני", "לא להתחייב לזמני אספקה".',
    editAvoided: 'מילים אסורות',
    editAvoidedHelp: 'מופרדות בפסיק. הבוט לא ישתמש בהן בשום הטיה.',
    editGreeting: 'הודעת פתיחה',
    editGreetingHelp: 'המשפט הראשון שכל מבקר רואה.',
    editEmoji: 'שימוש באימוג׳י',
    emojiNone: 'ללא',
    emojiLight: 'מועט',
    emojiModerate: 'בינוני',
    emojiHeavy: 'הרבה',
    saveChanges: 'שמירה',
    saving: 'שומר…',
    saved: 'נשמר',
    saveFailed: 'השמירה נכשלה',
    restoreAi: 'שחזור לגרסת ה-AI',
    restoreConfirm: 'לשחזר את הפרסונה שה-AI יצר? כל העריכות הידניות יימחקו.',
    editedBadge: 'נערך ידנית',
  },

  en: {
    // Header
    headerTitle: 'My bot',
    syncFromInstagram: 'Sync from Instagram',

    // Stats strip
    statPostsInKb: 'Posts in KB',
    statTopics: 'Topics',
    statLastScan: 'Last scan',
    notYetScanned: 'Not yet',

    // Instagram connection
    igConnectionTitle: 'Instagram connection',
    igConnectedPrefix: 'Connected — ',
    igNotConnected: 'Not connected',
    dmBot: 'DM bot',
    connectInstagram: 'Connect Instagram',

    // Empty persona state
    noPersonaTitle: 'No persona yet',
    noPersonaHelp: 'Sync from Instagram to build the persona.',

    // Voice & style
    voiceStyleTitle: 'Voice & style',
    tone: 'Tone',
    perspective: 'Perspective',
    emojis: 'Emojis',
    storyStyle: 'Story style',
    structure: 'Structure',
    sassLevel: 'Sass level',
    language: 'Language',
    signaturePhrases: 'Signature phrases',
    recurringPhrases: 'Recurring phrases',
    avoidedWords: 'Avoided words',

    // Knowledge map
    knowledgeMapTitle: 'Knowledge map',
    coreTopics: 'Core topics',
    areasOfExpertise: 'Areas of expertise',

    // About
    aboutTitle: 'About',
    bio: 'Bio',
    interests: 'Interests',
    directives: 'Directives',

    // Welcome message
    welcomeMessageTitle: 'Welcome message',

    // Chat link
    chatLink: 'Chat link',
    openChat: 'Open chat',
      // Persona editor
    editorTitle: 'Bot rules — edit',
    editorHelp: 'What you write here changes what the bot says. Changes save immediately and are not overwritten by the next scan.',
    editTone: 'Tone',
    editToneHelp: 'How the bot sounds. One sentence.',
    editDirectives: 'Directives — what to include and what to avoid',
    editDirectivesHelp: 'Plain-language rules. For example: "Always note that dues rates run through 2027", "Never quote a delivery date".',
    editAvoided: 'Words to avoid',
    editAvoidedHelp: 'Comma separated. The bot will not use them in any form.',
    editGreeting: 'Opening message',
    editGreetingHelp: 'The first line every visitor sees.',
    editEmoji: 'Emoji usage',
    emojiNone: 'None',
    emojiLight: 'Light',
    emojiModerate: 'Moderate',
    emojiHeavy: 'Heavy',
    saveChanges: 'Save changes',
    saving: 'Saving…',
    saved: 'Saved',
    saveFailed: 'Could not save',
    restoreAi: 'Restore AI version',
    restoreConfirm: 'Restore the persona the AI generated? All manual edits will be lost.',
    editedBadge: 'Edited by you',
  },
} as const;
