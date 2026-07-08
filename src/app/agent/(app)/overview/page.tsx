import { redirect } from 'next/navigation';

// "סקירה" became "פרויקטים" — keep the old path working.
export default function OverviewRedirect() {
  redirect('/agent/projects');
}
