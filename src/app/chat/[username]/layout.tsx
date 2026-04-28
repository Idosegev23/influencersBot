import type { Metadata } from 'next';
import { getAccountByUsername } from '@/lib/supabase';

interface Props {
  params: Promise<{ username: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Per-account OpenGraph / metadata for /chat/[username].
 * The chat page itself is a client component, so we generate the
 * <head> tags from this server-side layout. When LDRS is the account
 * we tailor the copy to the conference landing experience; other
 * accounts get a generic "shoutout" template based on display_name +
 * avatar.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  let account: any = null;
  try {
    account = await getAccountByUsername(username);
  } catch {
    // ignore — fall through to default metadata below
  }

  if (!account) {
    return {
      title: 'Bestie',
      description: 'בוט AI אישי',
    };
  }

  const config = (account.config || {}) as Record<string, any>;
  const displayName = config.display_name || username;
  const avatar = (config.avatar_url as string) || null;
  const subtitle = (config.chat_subtitle as string) || `שוחחו עם ${displayName}`;

  // LDRS conference: tailored copy
  if (username === 'ldrs_group') {
    const title = `${displayName} · Bestie — דברו ישירות עם הצוות`;
    const description =
      'סוכנות שיווק 360° של LDRS. AI · IMAI · NewVoices · Leaders Platform. ' +
      'הגעתם דרך הכנס? דברו עם הצוות, גלו את הרילסים והקייסים מהשטח, וקבעו פגישה.';

    return {
      title,
      description,
      keywords: [
        'LDRS',
        'Bestie',
        'AI',
        'NewVoices',
        'IMAI',
        'Leaders Platform',
        'כנס החדשנות',
        'איתמר גונשרוביץ',
        'שיווק משפיענים',
      ],
      openGraph: {
        title: `${displayName} · Bestie`,
        description:
          'דברו ישירות עם צוות LDRS. בוט AI אישי לכנס החדשנות 30.4 — שיווק, AI, ופתרונות 360°.',
        type: 'website',
        locale: 'he_IL',
        siteName: 'LDRS · Bestie',
        url: 'https://bestie.ldrsgroup.com/chat/ldrs_group?source=conf',
        images: avatar
          ? [{ url: avatar, width: 800, height: 800, alt: displayName }]
          : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${displayName} · Bestie`,
        description: 'דברו ישירות עם צוות LDRS — AI, שיווק, ופתרונות 360°.',
        images: avatar ? [avatar] : undefined,
      },
      icons: avatar
        ? { icon: avatar, apple: avatar, shortcut: avatar }
        : undefined,
      other: {
        'og:locale:alternate': 'en_US',
      },
    };
  }

  // Generic per-account metadata
  return {
    title: `${displayName} · Bestie`,
    description: subtitle,
    openGraph: {
      title: `${displayName} · Bestie`,
      description: subtitle,
      type: 'website',
      locale: 'he_IL',
      siteName: 'Bestie',
      images: avatar
        ? [{ url: avatar, width: 800, height: 800, alt: displayName }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} · Bestie`,
      description: subtitle,
      images: avatar ? [avatar] : undefined,
    },
    icons: avatar
      ? { icon: avatar, apple: avatar, shortcut: avatar }
      : undefined,
  };
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
