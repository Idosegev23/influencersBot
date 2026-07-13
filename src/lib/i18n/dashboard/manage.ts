// Manage / account page (/influencer/[username]/manage).
export const manage = {
  he: {
    // Toasts / dialogs
    settingsSaved: 'הגדרות נשמרו!',
    saveFailed: 'שגיאה בשמירה',
    confirmDeleteCoupon: 'למחוק קופון?',
    confirmDeleteProduct: 'למחוק מוצר?',
    promptProductName: 'שם המוצר:',
    promptProductCategory: 'קטגוריה (food, hair_care, face_care, body_care, spices, general):',
    promptProductPrice: 'מחיר (אופציונלי):',

    // Search
    searchPlaceholder: 'חיפוש...',

    // Coupon form
    couponCodeLabel: 'קוד קופון',
    couponBrandLabel: 'מותג',
    couponBrandPlaceholder: 'שם המותג',
    couponDescriptionLabel: 'תיאור ההנחה',
    couponDescriptionPlaceholder: 'לדוגמא: 20% הנחה על כל המוצרים',
    couponDiscountTypeLabel: 'סוג הנחה',
    discountTypePercentage: 'אחוז (%)',
    discountTypeFixed: 'סכום קבוע (₪)',
    couponDiscountValueLabel: 'ערך הנחה',
    save: 'שמור',
    cancel: 'ביטול',

    // Coupons tab
    addCoupon: 'הוסף קופון',
    couponsEmptyTitle: 'אין קופונים עדיין',
    couponsEmptyBody: 'הוסיפו קופונים שהבוט יציג לעוקבים',
    toggleOn: 'הפעל',
    toggleOff: 'כבה',

    // Brands / partnerships tab
    add: 'הוסף',
    websiteLink: 'אתר',

    // Products tab
    productCatalogTitle: 'קטלוג מוצרים',
    productsWord: 'מוצרים',
    withAiProfile: 'עם פרופיל AI',
    addProduct: 'הוסף מוצר',
    allCategories: 'הכל',
    featured: 'מומלץ',
    onSale: 'מבצע',
    productsEmptyTitle: 'אין מוצרים עדיין',
    productsEmptyBody: 'הוסיפו מוצרים או הריצו סריקת מוצרים מהאתר',
    moreProducts: 'מוצרים נוספים',

    // Content tab
    contentTitle: 'תוכן מפוסטים',
    contentEmptyTitle: 'אין תוכן עדיין',
    contentEmptyBody: 'התוכן נסרק אוטומטית מהפוסטים שלך באינסטגרם',
    contentTypes: {
      recipe: 'מתכון',
      look: 'לוק',
      tip: 'טיפ',
      workout: 'אימון',
      review: 'ביקורת',
      tutorial: 'מדריך',
    },

    // Settings tab
    chatSettingsTitle: 'הגדרות צ׳אט',
    greetingLabel: 'הודעת ברכה',
    greetingPlaceholder: 'היי! אני הבוט של...',
    suggestedQuestionsLabel: 'שאלות מוצעות',
    addQuestion: 'הוסף שאלה',
    questionPlaceholder: 'שאלה',
    suggestedQuestionsEmpty: 'אין שאלות מוצעות',
    saving: 'שומר...',
    saveSettings: 'שמור הגדרות',

    // Archetype tab labels
    tabPromotions: 'קופונים',
    tabPartnerships: 'שיתופי פעולה',
    tabContent: 'תוכן',
    tabChatSettings: 'הגדרות צ׳אט',
    tabOffersPromos: 'מבצעים וקופונים',
    tabProducts: 'מוצרים',
    tabClients: 'לקוחות',
    tabContentPublications: 'תוכן ופרסומים',
    tabPerksPromos: 'הטבות וקופונים',
    tabDealsPromos: 'דילים וקופונים',

    // Archetype section labels
    abBrandsTitlePartners: 'שותפים',
    abBrandsTitleUnits: 'יחידות',
    abBrandsTitleCustomers: 'לקוחות',
    abBrandsEmptyPartnerships: 'אין שיתופי פעולה עדיין',
    abBrandsEmptyPartners: 'אין שותפים עדיין',
    abBrandsEmptyClients: 'אין לקוחות עדיין',
    abBrandsEmptyUnits: 'אין יחידות עדיין',
    abBrandsEmptyCustomers: 'אין לקוחות עדיין',
    emDash: '—',
  },
  en: {
    // Toasts / dialogs
    settingsSaved: 'Settings saved',
    saveFailed: "Couldn't save changes",
    confirmDeleteCoupon: 'Delete this promo code?',
    confirmDeleteProduct: 'Delete this product?',
    promptProductName: 'Product name:',
    promptProductCategory: 'Category (food, hair_care, face_care, body_care, spices, general):',
    promptProductPrice: 'Price (optional):',

    // Search
    searchPlaceholder: 'Search…',

    // Coupon form
    couponCodeLabel: 'Promo code',
    couponBrandLabel: 'Brand',
    couponBrandPlaceholder: 'Brand name',
    couponDescriptionLabel: 'Discount description',
    couponDescriptionPlaceholder: 'e.g. 20% off all products',
    couponDiscountTypeLabel: 'Discount type',
    discountTypePercentage: 'Percentage (%)',
    discountTypeFixed: 'Fixed amount (₪)',
    couponDiscountValueLabel: 'Discount value',
    save: 'Save',
    cancel: 'Cancel',

    // Coupons tab
    addCoupon: 'Add promo code',
    couponsEmptyTitle: 'No promotions yet',
    couponsEmptyBody: 'Add promotions for the bot to share with visitors.',
    toggleOn: 'Enable',
    toggleOff: 'Disable',

    // Brands / partnerships tab
    add: 'Add',
    websiteLink: 'Website',

    // Products tab
    productCatalogTitle: 'Product catalog',
    productsWord: 'products',
    withAiProfile: 'with AI profile',
    addProduct: 'Add product',
    allCategories: 'All',
    featured: 'Featured',
    onSale: 'On sale',
    productsEmptyTitle: 'No products yet',
    productsEmptyBody: 'Add products manually or run a product scan of the site.',
    moreProducts: 'More products',

    // Content tab
    contentTitle: 'Content from posts',
    contentEmptyTitle: 'No content yet',
    contentEmptyBody: 'Content is scraped automatically from your Instagram posts.',
    contentTypes: {
      recipe: 'Recipe',
      look: 'Look',
      tip: 'Tip',
      workout: 'Workout',
      review: 'Review',
      tutorial: 'Tutorial',
    },

    // Settings tab
    chatSettingsTitle: 'Chat settings',
    greetingLabel: 'Welcome message',
    greetingPlaceholder: "Hi! I'm the bot for…",
    suggestedQuestionsLabel: 'Suggested questions',
    addQuestion: 'Add question',
    questionPlaceholder: 'Question',
    suggestedQuestionsEmpty: 'No suggested questions yet',
    saving: 'Saving…',
    saveSettings: 'Save settings',

    // Archetype tab labels
    tabPromotions: 'Promotions',
    tabPartnerships: 'Partnerships',
    tabContent: 'Content',
    tabChatSettings: 'Chat settings',
    tabOffersPromos: 'Offers & promos',
    tabProducts: 'Products',
    tabClients: 'Clients',
    tabContentPublications: 'Content & publications',
    tabPerksPromos: 'Perks & promos',
    tabDealsPromos: 'Deals & promos',

    // Archetype section labels
    abBrandsTitlePartners: 'Partners',
    abBrandsTitleUnits: 'Units',
    abBrandsTitleCustomers: 'Customers',
    abBrandsEmptyPartnerships: 'No partnerships yet',
    abBrandsEmptyPartners: 'No partners yet',
    abBrandsEmptyClients: 'No clients yet',
    abBrandsEmptyUnits: 'No units yet',
    abBrandsEmptyCustomers: 'No customers yet',
    emDash: '—',
  },
} as const;
