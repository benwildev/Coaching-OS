import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export default async function CommunicationPage() {
  // Land on the first sub-page the user is actually permitted to open.
  const session = await getSession();
  if (session && !can(session, 'communication.templates.read') && can(session, 'communication.logs.read')) {
    redirect('/communication/logs');
  }
  redirect('/communication/templates');
}
