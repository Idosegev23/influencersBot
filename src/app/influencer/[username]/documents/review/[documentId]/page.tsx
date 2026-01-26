import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ReviewPageClient } from './ReviewPageClient';

export default async function ReviewDocumentPage({
  params,
}: {
  params: Promise<{ username: string; documentId: string }>;
}) {
  const { username, documentId } = await params;
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get account
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('name', username)
    .single();

  if (!account) {
    redirect('/404');
  }

  // Get document with parsed data
  const { data: document, error } = await supabase
    .from('partnership_documents')
    .select('*')
    .eq('id', documentId)
    .eq('account_id', account.id)
    .single();

  if (error || !document) {
    redirect(`/influencer/${username}/documents`);
  }

  // Get AI parsing log for confidence scores
  const { data: parsingLog } = await supabase
    .from('ai_parsing_logs')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <ReviewPageClient
      document={document}
      parsingLog={parsingLog}
      accountId={account.id}
      username={username}
    />
  );
}
