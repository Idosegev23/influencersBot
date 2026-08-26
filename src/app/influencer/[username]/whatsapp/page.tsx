'use client';

import { useParams } from 'next/navigation';
import { WhatsAppConnectCard } from '@/components/onboard/WhatsAppConnectCard';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { dashboardDir } from '@/lib/i18n/dashboard';

/**
 * WhatsApp connect for an EXISTING customer.
 *
 * The onboarding wizard only reaches accounts created through it — the large majority of
 * live accounts never had a token, so this is the only door they have. Same card, same
 * endpoints; the account comes from their session instead of a link.
 */
export default function WhatsAppPage() {
  const params = useParams();
  const username = params.username as string;
  const { lang } = useDashboardLang(username);
  const dir = dashboardDir(lang);
  const he = lang !== 'en';

  return (
    <div dir={dir} className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">
        {he ? 'וואטסאפ' : 'WhatsApp'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {he
          ? 'חברו את מספר הוואטסאפ העסקי שלכם כדי שהבוט יענה עליו ללקוחות שלכם.'
          : 'Connect your business WhatsApp number so the bot can answer your customers on it.'}
      </p>

      <WhatsAppConnectCard apiBase={`/api/influencer/${username}`} language={he ? 'he' : 'en'} />
    </div>
  );
}
