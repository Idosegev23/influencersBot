import { notFound } from 'next/navigation';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { onboardLang } from '@/lib/i18n/onboard';
import OnboardWizard from './OnboardWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) notFound();
  const lang = onboardLang(draft.config?.onboarding?.language);
  return <OnboardWizard token={token} lang={lang} />;
}
