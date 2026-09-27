import { redirect } from 'next/navigation';

// Legacy URL: students and guardians sign in on the single /login page.
export default function LegacyPortalLoginPage() {
  redirect('/login');
}
