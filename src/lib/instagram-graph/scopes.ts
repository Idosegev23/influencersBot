/**
 * Instagram OAuth scopes we request at connect time.
 *
 * Only permissions with **Advanced Access** belong here. A permission still at
 * Standard Access works for users who hold a role in the Meta app (admin /
 * developer / tester) but not for the general public — asking for it in the
 * authorize URL risks failing the whole consent screen for a real customer.
 *
 * App Review, submitted 2026-08-08:
 *   instagram_business_basic            → APPROVED  (profile + /media + /stories)
 *   instagram_business_manage_messages  → APPROVED  (the DM bot)
 *   instagram_business_manage_insights  → NOT approved (reach/impressions/demographics)
 *   instagram_business_manage_comments  → NOT approved (read + reply + hide comments)
 *
 * The two rejected ones are still usable against tester accounts via the
 * /admin/meta-review console, which calls Graph directly and does not go
 * through this list. Re-add them here only once App Review approves them.
 */
export const IG_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
] as const;

export const IG_OAUTH_SCOPE_PARAM = IG_OAUTH_SCOPES.join(',');
