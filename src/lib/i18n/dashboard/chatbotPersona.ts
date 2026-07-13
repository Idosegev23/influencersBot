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
  },
} as const;
