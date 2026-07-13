// Documents page (/influencer/[username]/documents).
export const documents = {
  he: {
    // Header
    pageTitle: 'מאגר מסמכים',
    pageSubtitle: 'העלה מסמכים למאגר המידע של הצ\'אטבוט',
    back: 'חזרה',

    // Upload section
    uploadTitle: 'העלאת מסמך למאגר',
    uploadHelp: 'המסמך ינותח אוטומטית, יפוצל לחלקים ויוזן למאגר הידע של הצ\'אטבוט. PDF, Word, Excel, תמונות (עד 10MB)',

    // Parsing state
    parsingTitle: 'מנתח ומאנדקס...',
    parsingHelp: 'המסמך עובר ניתוח AI, פיצול לחלקים, והזנה למאגר הידע',

    // Success state
    successTitle: 'המסמך נוסף למאגר בהצלחה!',
    successHelp: 'התוכן זמין לשליפה בצ\'אטבוט כבר עכשיו',

    // Errors
    close: 'סגור',
    loadError: 'שגיאה בטעינת המסמכים',
    parseFailed: 'הניתוח נכשל',
    parseErrorFallback: 'שגיאה בניתוח המסמך',

    // Stats strip
    statDocuments: 'מסמכים במאגר',
    statIndexed: 'מאונדקסים בצ\'אטבוט',

    // Empty state
    emptyTitle: 'אין מסמכים במאגר עדיין',
    emptyHelp: 'העלה מסמך למעלה והמערכת תוסיף אותו אוטומטית',

    // Document list / status badges
    chunks: 'חלקים',
    statusIndexing: 'מאנדקס',
    statusFailed: 'נכשל',
    statusPending: 'ממתין',
    statusParsing: 'מנתח',
  },
  en: {
    // Header
    pageTitle: 'Documents',
    pageSubtitle: 'Upload documents to the chatbot knowledge base',
    back: 'Back',

    // Upload section
    uploadTitle: 'Upload a document',
    uploadHelp: 'The document is auto-analyzed, chunked, and added to the chatbot knowledge base. PDF, Word, Excel, images (up to 10MB).',

    // Parsing state
    parsingTitle: 'Parsing and indexing…',
    parsingHelp: 'The document is going through AI parsing, chunking, and ingestion into the knowledge base.',

    // Success state
    successTitle: 'Document added successfully!',
    successHelp: 'The content is now retrievable by the chatbot.',

    // Errors
    close: 'Close',
    loadError: 'Failed to load documents',
    parseFailed: 'Parsing failed',
    parseErrorFallback: 'Something went wrong while parsing the document',

    // Stats strip
    statDocuments: 'Documents',
    statIndexed: 'Indexed in chatbot',

    // Empty state
    emptyTitle: 'No documents yet',
    emptyHelp: 'Upload a document above and we’ll add it automatically.',

    // Document list / status badges
    chunks: 'chunks',
    statusIndexing: 'Indexing',
    statusFailed: 'Failed',
    statusPending: 'Pending',
    statusParsing: 'Parsing',
  },
} as const;
