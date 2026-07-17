/**
 * The LDRS lead bucket.
 *
 * `service_briefs.account_id` is `uuid NOT NULL` with an FK to accounts(id), so
 * every public lead form must post a real account UUID. The landing form used to
 * send the literal string 'landing', which Postgres rejected — every submission
 * 500'd and the lead was lost, silently, for the life of the page.
 *
 * Import this instead of pasting the UUID: three public forms (/, /contact,
 * /bestieai) feed the same bucket and must not drift apart.
 */
export const LEADS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
