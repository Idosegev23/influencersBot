import { redirect } from 'next/navigation';

// The old auto-convert inbox is superseded by the brief pricing flow.
export default function InboxRedirect() {
  redirect('/agent/briefs');
}
