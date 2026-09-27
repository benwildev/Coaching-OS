import { redirect } from 'next/navigation';

// Legacy URL: password recovery for every account type starts at /forgot-password.
export default function LegacyPortalForgotPasswordPage() {
  redirect('/forgot-password');
}
