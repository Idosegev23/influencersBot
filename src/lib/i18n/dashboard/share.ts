// Share page — QR code, links, UTM builder.
// Was never internationalised: the whole page rendered Hebrew regardless of
// accounts.language, so an overseas customer's "share your bot" screen was in a
// script they cannot read.
export const share = {
  he: {
    qrHint: 'סרקו את הקוד כדי לגשת ישירות לצ׳אטבוט',
    downloadQr: 'הורד QR Code',
    linksTitle: 'לינקים',
    basicLink: 'לינק בסיסי',
    trackedLink: 'לינק עם מעקב (UTM)',
    sourceLabel: 'מקור (source)',
    mediumLabel: 'אמצעי (medium)',
    campaignPlaceholder: 'שם הקמפיין (אופציונלי)',
    presetPersonalSite: 'אתר אישי',
    presetCustom: 'מותאם אישית',
    tipsTitle: '💡 טיפים לשיתוף',
    tipBio: 'הוסיפו את הלינק לביו באינסטגרם או ב-Linktree',
    tipStories: 'השתמשו ב-QR Code בסטוריז או בפוסטים',
    tipUtm: 'לינקים עם UTM יעזרו לכם לעקוב מאיפה מגיעים המבקרים',
    tipCampaign: 'שנו את שם הקמפיין לכל פרסום שונה למעקב מדויק',
  },
  en: {
    qrHint: 'Scan the code to open the assistant directly',
    downloadQr: 'Download QR code',
    linksTitle: 'Links',
    basicLink: 'Basic link',
    trackedLink: 'Tracked link (UTM)',
    sourceLabel: 'Source',
    mediumLabel: 'Medium',
    campaignPlaceholder: 'Campaign name (optional)',
    presetPersonalSite: 'Website',
    presetCustom: 'Custom',
    tipsTitle: '💡 Sharing tips',
    tipBio: 'Add the link to your Instagram bio or Linktree',
    tipStories: 'Use the QR code in stories and posts',
    tipUtm: 'UTM links let you see where your visitors came from',
    tipCampaign: 'Change the campaign name per placement for accurate tracking',
  },
} as const;
