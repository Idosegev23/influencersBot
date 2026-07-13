// Partnerships / Clients page.
// Two archetype variants share this page: "partnership" (influencer/brand)
// and "client" (service_provider). Keys are grouped by purpose.
export const partnerships = {
  he: {
    // Page titles (archetype-aware)
    titlePartnerships: 'שיתופי פעולה',
    titleClients: 'לקוחות',

    // "New …" button + add-form heading
    newPartnership: 'שת״פ חדש',
    newClient: 'לקוח חדש',

    // Stats strip
    statTotal: 'סה״כ',
    statActive: 'פעילים',
    statTotalValue: 'שווי כולל',

    // Form field labels
    fieldBrandName: 'שם המותג',
    fieldClientName: 'שם הלקוח',
    fieldStatus: 'סטטוס',
    fieldContact: 'איש קשר',
    fieldAmount: 'סכום',
    fieldBrief: 'בריף / תיאור',
    fieldNotes: 'הערות',
    fieldEmail: 'אימייל',
    fieldPhone: 'טלפון',

    // Buttons
    cancel: 'ביטול',
    save: 'שמירה',

    // Empty state
    emptyPartnerships: 'אין שיתופי פעולה עדיין',
    emptyClients: 'אין לקוחות עדיין',
    emptyHintPartnerships: 'הוסיפו שיתופי פעולה כדי שהבוט יוכל לענות עליהם בשיחות',
    emptyHintClients: 'הוסיפו לקוחות כדי שהבוט יוכל לענות עליהם בשיחות',
    addFirstPartnership: 'הוספת שת״פ ראשון',
    addFirstClient: 'הוספת לקוח ראשון',

    // Expanded detail labels (with trailing colon)
    detailEmail: 'אימייל:',
    detailPhone: 'טלפון:',
    detailStarts: 'תחילה:',
    detailEnds: 'סיום:',
    detailBrief: 'בריף:',
    detailNotes: 'הערות:',
    linkLabel: 'קישור',

    // Delete confirmation
    confirmDeletePartnership: 'למחוק את השת״פ?',
    confirmDeleteClient: 'למחוק את הלקוח?',

    // Status labels
    statusActive: 'פעיל',
    statusInProgress: 'בביצוע',
    statusProposal: 'הצעה',
    statusNegotiation: 'משא ומתן',
    statusCompleted: 'הושלם',
    statusCancelled: 'בוטל',
  },
  en: {
    // Page titles (archetype-aware)
    titlePartnerships: 'Partnerships',
    titleClients: 'Clients',

    // "New …" button + add-form heading
    newPartnership: 'New partnership',
    newClient: 'New client',

    // Stats strip
    statTotal: 'Total',
    statActive: 'Active',
    statTotalValue: 'Total value',

    // Form field labels
    fieldBrandName: 'Brand name',
    fieldClientName: 'Client name',
    fieldStatus: 'Status',
    fieldContact: 'Contact',
    fieldAmount: 'Amount',
    fieldBrief: 'Brief / description',
    fieldNotes: 'Notes',
    fieldEmail: 'Email',
    fieldPhone: 'Phone',

    // Buttons
    cancel: 'Cancel',
    save: 'Save',

    // Empty state
    emptyPartnerships: 'No partnerships yet',
    emptyClients: 'No clients yet',
    emptyHintPartnerships: 'Add partnerships so the bot can reference them in conversations.',
    emptyHintClients: 'Add clients so the bot can reference them in conversations.',
    addFirstPartnership: 'Add your first partnership',
    addFirstClient: 'Add your first client',

    // Expanded detail labels (with trailing colon)
    detailEmail: 'Email:',
    detailPhone: 'Phone:',
    detailStarts: 'Starts:',
    detailEnds: 'Ends:',
    detailBrief: 'Brief:',
    detailNotes: 'Notes:',
    linkLabel: 'Link',

    // Delete confirmation
    confirmDeletePartnership: 'Delete this partnership?',
    confirmDeleteClient: 'Delete this client?',

    // Status labels
    statusActive: 'Active',
    statusInProgress: 'In progress',
    statusProposal: 'Proposal',
    statusNegotiation: 'Negotiation',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
  },
} as const;
