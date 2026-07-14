/**
 * Dashboard i18n — single source of truth for the `/influencer/[username]/*`
 * surfaces (the operator-side dashboard).
 *
 * Split one-file-per-section so each dashboard page maps to one catalog file
 * (easy to extend + safe to edit in parallel). Each section file exports
 * `{ he, en }`; this index composes them and keeps the public API stable, so
 * every `import … from '@/lib/i18n/dashboard'` keeps working unchanged.
 *
 * Hebrew is the default for the existing accounts; English is opt-in per account
 * (accounts.language = 'en'). Anything not 'en' falls back to Hebrew.
 */

import { nav } from './nav';
import { support } from './support';
import { settings } from './settings';
import { analytics } from './analytics';
import { dashboard } from './dashboard';
import { attribution } from './attribution';
import { partnerships } from './partnerships';
import { coupons } from './coupons';
import { products } from './products';
import { botContent } from './botContent';
import { conversations } from './conversations';
import { instagram } from './instagram';
import { chatbotSettings } from './chatbotSettings';
import { chatbotPersona } from './chatbotPersona';
import { documents } from './documents';
import { login } from './login';
import { manage } from './manage';
import { tutorial } from './tutorial';
import { common } from './common';

export type DashboardLang = 'he' | 'en';

const STRINGS = {
  he: {
    nav: nav.he,
    support: support.he,
    settings: settings.he,
    analytics: analytics.he,
    dashboard: dashboard.he,
    attribution: attribution.he,
    partnerships: partnerships.he,
    coupons: coupons.he,
    products: products.he,
    botContent: botContent.he,
    conversations: conversations.he,
    instagram: instagram.he,
    chatbotSettings: chatbotSettings.he,
    chatbotPersona: chatbotPersona.he,
    documents: documents.he,
    login: login.he,
    manage: manage.he,
    tutorial: tutorial.he,
    common: common.he,
  },
  en: {
    nav: nav.en,
    support: support.en,
    settings: settings.en,
    analytics: analytics.en,
    dashboard: dashboard.en,
    attribution: attribution.en,
    partnerships: partnerships.en,
    coupons: coupons.en,
    products: products.en,
    botContent: botContent.en,
    conversations: conversations.en,
    instagram: instagram.en,
    chatbotSettings: chatbotSettings.en,
    chatbotPersona: chatbotPersona.en,
    documents: documents.en,
    login: login.en,
    manage: manage.en,
    tutorial: tutorial.en,
    common: common.en,
  },
} as const;

export type DashboardStrings = typeof STRINGS.he;

export function getDashboardStrings(lang: string | null | undefined): DashboardStrings {
  const key = (lang || 'he').toLowerCase() === 'en' ? 'en' : 'he';
  return STRINGS[key] as unknown as DashboardStrings;
}

/** Resolve the layout direction for the dashboard surface. */
export function dashboardDir(lang: string | null | undefined): 'ltr' | 'rtl' {
  return (lang || 'he').toLowerCase() === 'en' ? 'ltr' : 'rtl';
}

/** Validate an incoming language value. Returns the language or null if unsupported. */
export function normalizeLang(lang: unknown): DashboardLang | null {
  return lang === 'en' || lang === 'he' ? lang : null;
}
